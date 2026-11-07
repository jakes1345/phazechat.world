package world.phazechat.app.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import world.phazechat.app.R
import world.phazechat.app.data.GoogleStep

/** What the sign-in screen needs to show Sign in with Google. */
class GoogleAuthUi(
    val available: Boolean,
    val busy: Boolean,
    val step: GoogleStep?,
    val error: String?,
    val onSignIn: () -> Unit,
    val onRegister: (username: String) -> Unit,
    val onLink: (password: String, totpCode: String, username: String) -> Unit,
    val onTotp: (code: String) -> Unit,
    val onCancel: () -> Unit,
)

/** Google's standard light sign-in button: white, grey outline, the G mark. */
@Composable
fun GoogleSignInButton(label: String, busy: Boolean, onClick: () -> Unit) {
    OutlinedButton(
        onClick = onClick,
        enabled = !busy,
        modifier = Modifier.fillMaxWidth().height(48.dp),
        shape = MaterialTheme.shapes.extraLarge,
        border = BorderStroke(1.dp, Color(0xFF747775)),
        colors = ButtonDefaults.outlinedButtonColors(
            containerColor = Color.White,
            contentColor = Color(0xFF1F1F1F),
            disabledContainerColor = Color.White,
            disabledContentColor = Color(0x991F1F1F),
        ),
    ) {
        if (busy) {
            CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp, color = Color(0xFF747775))
        } else {
            Image(painterResource(R.drawable.ic_google_g), contentDescription = null, modifier = Modifier.size(18.dp))
        }
        Spacer(Modifier.width(10.dp))
        Text(label, fontWeight = FontWeight.Medium)
    }
}

/** The "or" line between password sign-in and the Google button. */
@Composable
fun AuthOrDivider() {
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().padding(vertical = 12.dp)) {
        HorizontalDivider(Modifier.weight(1f))
        Text("or", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp, modifier = Modifier.padding(horizontal = 12.dp))
        HorizontalDivider(Modifier.weight(1f))
    }
}

/** The step after Google, when there is one. */
@Composable
fun GoogleStepForm(ui: GoogleAuthUi, step: GoogleStep) {
    val focus = LocalFocusManager.current
    // Keyed on the step so a new step starts with empty fields.
    var username by remember(step) {
        mutableStateOf(
            when (step) {
                is GoogleStep.ChooseUsername -> step.suggestion
                is GoogleStep.Link -> step.username
                else -> ""
            }
        )
    }
    var password by remember(step::class) { mutableStateOf("") }
    var code by remember(step::class) { mutableStateOf("") }

    val note: @Composable (String) -> Unit = { text ->
        Text(
            text,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontSize = 13.sp,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(bottom = 16.dp),
        )
    }

    when (step) {
        is GoogleStep.ChooseUsername -> {
            Text("Choose your Phaze name", fontSize = 18.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(8.dp))
            note("Signing up as ${step.email}. Pick the username your contacts will find you by (3 to 32 letters, numbers, dots, dashes or underscores).")
            OutlinedTextField(
                value = username,
                onValueChange = { username = it.take(32) },
                label = { Text("Username") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Go),
                keyboardActions = KeyboardActions(onGo = { focus.clearFocus(); if (username.trim().length >= 3) ui.onRegister(username) }),
            )
        }
        is GoogleStep.Link -> {
            Text("Connect your Phaze account", fontSize = 18.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(8.dp))
            note("There's already a Phaze account for ${step.email}. Enter its password once to connect Google to it. After that, Google signs you straight in. Forgot it? Use the website's \"Forgot password?\", then come back.")
            OutlinedTextField(
                value = username,
                onValueChange = { username = it },
                label = { Text("Username") },
                singleLine = true,
                readOnly = step.username.isNotBlank(),
                modifier = Modifier.fillMaxWidth(),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
            )
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(
                value = password,
                onValueChange = { password = it },
                label = { Text("Password") },
                singleLine = true,
                visualTransformation = PasswordVisualTransformation(),
                modifier = Modifier.fillMaxWidth(),
                keyboardOptions = KeyboardOptions(imeAction = if (step.needsTotp) ImeAction.Next else ImeAction.Go),
                keyboardActions = KeyboardActions(onGo = { focus.clearFocus(); if (password.isNotEmpty()) ui.onLink(password, code, username) }),
            )
            if (step.needsTotp) {
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = code,
                    onValueChange = { code = it.take(11) },
                    label = { Text("2FA code or backup code") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Go),
                    keyboardActions = KeyboardActions(onGo = { focus.clearFocus(); ui.onLink(password, code, username) }),
                )
            }
        }
        is GoogleStep.Totp -> {
            Text("Two-step verification", fontSize = 18.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(8.dp))
            note("Your account has 2FA on. Enter the code from your authenticator app, or a backup code.")
            OutlinedTextField(
                value = code,
                onValueChange = { code = it.take(11) },
                label = { Text("Authenticator or backup code") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Go),
                keyboardActions = KeyboardActions(onGo = { focus.clearFocus(); if (code.trim().length >= 6) ui.onTotp(code) }),
            )
        }
    }

    Spacer(Modifier.height(16.dp))
    if (ui.error != null) {
        Text(ui.error, color = MaterialTheme.colorScheme.error, fontSize = 13.sp, textAlign = TextAlign.Center)
        Spacer(Modifier.height(8.dp))
    }

    val (label, enabled, action) = when (step) {
        is GoogleStep.ChooseUsername -> Triple("Create Account", username.trim().length >= 3, { ui.onRegister(username) })
        is GoogleStep.Link -> Triple(
            "Connect and Sign In",
            username.isNotBlank() && password.isNotEmpty() && (!step.needsTotp || code.trim().length >= 6),
            { ui.onLink(password, code, username) },
        )
        is GoogleStep.Totp -> Triple("Verify", code.trim().length >= 6, { ui.onTotp(code) })
    }
    Button(
        onClick = { focus.clearFocus(); action() },
        modifier = Modifier.fillMaxWidth().height(48.dp),
        enabled = enabled && !ui.busy,
    ) {
        if (ui.busy) {
            CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.onPrimary)
        } else {
            Text(label, fontWeight = FontWeight.Bold)
        }
    }
    Spacer(Modifier.height(12.dp))
    TextButton(onClick = ui.onCancel, enabled = !ui.busy) { Text("Cancel") }
}
