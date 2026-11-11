package world.phazechat.app.data

import android.app.Activity
import android.os.Build
import android.util.Log
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.NoCredentialException
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.android.libraries.identity.googleid.GoogleIdTokenParsingException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/** The step Sign in with Google still needs before the person is signed in. */
sealed class GoogleStep {
    /** A Google account Phaze hasn't seen: pick a username for the new account. */
    data class ChooseUsername(val ticket: String, val email: String, val suggestion: String) : GoogleStep()

    /** There's already a Phaze account with this email: its password connects Google to it. */
    data class Link(val ticket: String, val email: String, val username: String, val needsTotp: Boolean = false) : GoogleStep()

    /** The account has 2FA on: one more code. */
    data class Totp(val ticket: String) : GoogleStep()
}

/** What the server said about a Google sign-in or one of its follow-up steps. */
sealed class GoogleResult {
    data class SignedIn(val username: String, val token: String) : GoogleResult()
    data class Next(val step: GoogleStep) : GoogleResult()
    data class TotpNeeded(val message: String?) : GoogleResult()
    data class Failed(val message: String) : GoogleResult()

    companion object {
        /** Reads a response from /api/v1/auth/google/{idtoken,register,link,totp}. */
        fun parse(json: JSONObject?, fallback: String = "Sign in with Google didn't finish. Try again."): GoogleResult {
            if (json == null) return Failed(fallback)
            val err = json.optString("error").ifBlank { null }
            val ticket = json.optString("ticket")
            val email = json.optString("email")
            return when (json.optString("status")) {
                "ok" -> {
                    val token = json.optString("token")
                    val user = json.optString("username")
                    if (token.isNotBlank() && user.isNotBlank()) SignedIn(user, token) else Failed(fallback)
                }
                "username_required" ->
                    if (ticket.isNotBlank()) Next(GoogleStep.ChooseUsername(ticket, email, json.optString("suggestion"))) else Failed(err ?: fallback)
                "link_required" ->
                    if (ticket.isNotBlank()) Next(GoogleStep.Link(ticket, email, json.optString("username"))) else Failed(err ?: fallback)
                "totp_required" ->
                    if (ticket.isNotBlank()) Next(GoogleStep.Totp(ticket)) else TotpNeeded(err)
                else -> Failed(err ?: fallback)
            }
        }
    }
}

/**
 * Sign in with Google for the app. Google's own sheet (Credential Manager)
 * hands back an ID token for the person's Google account; the server checks
 * its signature, audience and the one-time nonce it issued, then signs the
 * person in, or names the step still needed (see nexus_server/google_auth.go).
 *
 * onSignedIn gets the Phaze session token, the same kind password sign-in
 * returns, so the rest of the app carries on exactly as after a normal login.
 */
class GoogleSignInController(
    private val scope: CoroutineScope,
    private val baseUrl: String = "https://phazechat.world",
    private val onSignedIn: (token: String, username: String) -> Unit,
) {
    companion object {
        private const val TAG = "PhazeGoogle"
        private val JSON = "application/json; charset=utf-8".toMediaType()
    }

    private val http = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .build()

    private val _available = MutableStateFlow(false)
    /** True once the server says Sign in with Google is switched on for the app. */
    val available = _available.asStateFlow()

    private val _step = MutableStateFlow<GoogleStep?>(null)
    val step = _step.asStateFlow()

    private val _busy = MutableStateFlow(false)
    val busy = _busy.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error = _error.asStateFlow()

    private val device = "android/${Build.MODEL}"

    /** Asks the server whether Google sign-in is on, to show or hide the button. */
    fun refreshAvailable() {
        scope.launch {
            val cfg = withContext(Dispatchers.IO) { getJson("/api/v1/auth/google/config") }
            _available.value = cfg?.optBoolean("app", false) == true
        }
    }

    /**
     * Opens Google's account picker and signs in with the account chosen.
     * Runs in the caller's scope because Credential Manager needs a live
     * Activity for its sheet.
     */
    suspend fun signIn(activity: Activity) {
        if (_busy.value) return
        _busy.value = true
        _error.value = null
        try {
            val start = withContext(Dispatchers.IO) { getJson("/api/v1/auth/google/nonce") }
            val nonce = start?.optString("nonce").orEmpty()
            val clientId = start?.optString("client_id").orEmpty()
            if (nonce.isBlank() || clientId.isBlank()) {
                _error.value = start?.optString("error")?.ifBlank { null }
                    ?: "Sign in with Google isn't available right now. Try again later."
                return
            }
            val idToken = requestIdToken(activity, clientId, nonce) ?: return
            val body = JSONObject()
                .put("id_token", idToken)
                .put("nonce", nonce)
                .put("device_info", device)
            apply(withContext(Dispatchers.IO) { postJson("/api/v1/auth/google/idtoken", body) })
        } finally {
            _busy.value = false
        }
    }

    private suspend fun requestIdToken(activity: Activity, clientId: String, nonce: String): String? {
        // serverClientId is the web client: Google puts it in the token's aud,
        // which is what the server checks. The Android client (package name
        // plus signing certificate) is matched by Google itself.
        val option = GetSignInWithGoogleOption.Builder(clientId)
            .setNonce(nonce)
            .build()
        val request = GetCredentialRequest.Builder().addCredentialOption(option).build()
        return try {
            val result = CredentialManager.create(activity).getCredential(activity, request)
            val cred = result.credential
            if (cred is CustomCredential && cred.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
                GoogleIdTokenCredential.createFrom(cred.data).idToken
            } else {
                _error.value = "Google didn't return an account. Try again."
                null
            }
        } catch (_: GetCredentialCancellationException) {
            null // they closed Google's sheet: nothing to say
        } catch (_: NoCredentialException) {
            _error.value = "No Google account on this phone. Add one in Android Settings, then try again."
            null
        } catch (e: GoogleIdTokenParsingException) {
            Log.w(TAG, "bad Google credential: ${e.message}")
            _error.value = "Google sign-in didn't work. Try again."
            null
        } catch (e: GetCredentialException) {
            Log.w(TAG, "getCredential: ${e.type}: ${e.message}")
            _error.value = "Google sign-in didn't work. Try again."
            null
        }
    }

    /** Creates the new account under the username they picked. */
    fun register(username: String) {
        val s = _step.value as? GoogleStep.ChooseUsername ?: return
        runStep("register", JSONObject().put("ticket", s.ticket).put("username", username.trim()))
    }

    /** Connects Google to the existing account with that account's password. */
    fun link(password: String, totpCode: String, username: String) {
        val s = _step.value as? GoogleStep.Link ?: return
        val user = s.username.ifBlank { username.trim() }
        runStep(
            "link",
            JSONObject().put("ticket", s.ticket).put("username", user)
                .put("password", password).put("totp_code", totpCode.trim()),
        )
    }

    fun totp(code: String) {
        val s = _step.value as? GoogleStep.Totp ?: return
        runStep("totp", JSONObject().put("ticket", s.ticket).put("totp_code", code.trim()))
    }

    fun cancel() {
        _step.value = null
        _error.value = null
    }

    fun clearError() {
        _error.value = null
    }

    private fun runStep(path: String, body: JSONObject) {
        if (_busy.value) return
        _busy.value = true
        _error.value = null
        body.put("device_info", device).put("platform", "app")
        scope.launch {
            try {
                apply(withContext(Dispatchers.IO) { postJson("/api/v1/auth/google/$path", body) })
            } finally {
                _busy.value = false
            }
        }
    }

    private fun apply(json: JSONObject?) {
        when (val r = GoogleResult.parse(json)) {
            is GoogleResult.SignedIn -> {
                _step.value = null
                _error.value = null
                onSignedIn(r.token, r.username)
            }
            is GoogleResult.Next -> _step.value = r.step
            is GoogleResult.TotpNeeded -> {
                // The link step: the password was right and the account has
                // 2FA, so the same form asks for the code too.
                (_step.value as? GoogleStep.Link)?.let { _step.value = it.copy(needsTotp = true) }
                _error.value = r.message ?: "Enter your 2FA code or a backup code."
            }
            is GoogleResult.Failed -> _error.value = r.message
        }
    }

    private fun getJson(path: String): JSONObject? = call(Request.Builder().url(baseUrl + path).get().build())

    private fun postJson(path: String, body: JSONObject): JSONObject? =
        call(Request.Builder().url(baseUrl + path).post(body.toString().toRequestBody(JSON)).build())

    private fun call(req: Request): JSONObject? = try {
        http.newCall(req).execute().use { res ->
            val text = res.body.string()
            // Error responses carry {"status":"error","error":"..."} too.
            if (text.isBlank()) null else JSONObject(text)
        }
    } catch (e: Exception) {
        Log.w(TAG, "${req.method} ${req.url.encodedPath}: ${e.message}")
        JSONObject().put("status", "error").put("error", "Network error. Check your connection and try again.")
    }
}
