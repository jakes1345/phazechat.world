package world.phazechat.app.crypto

import org.json.JSONObject
import java.security.MessageDigest
import java.util.Base64

// Contacts' public keys pinned on this device (trust on first use), the same
// model as the web client's keyPins: the first key seen for a contact is
// remembered with its fingerprint, and a different key later is refused
// rather than silently trusted. Pure JVM code so it can be unit tested.

const val E2EE_BODY_PREFIX = "E2EE:"

/** Shown in place of a message this device can't decrypt (yet). */
const val ENCRYPTED_PLACEHOLDER = "🔒 [Encrypted]"

fun isEncryptedBody(body: String?): Boolean = body != null && body.startsWith(E2EE_BODY_PREFIX)

/** First 16 hex chars of SHA-256(pub); matches the web and Go fingerprints. */
fun keyFingerprint(pub: ByteArray): String {
    val digest = MessageDigest.getInstance("SHA-256").digest(pub)
    return digest.take(8).joinToString("") { "%02x".format(it) }
}

data class KeyPin(val fingerprint: String, val publicKeyB64: String) {
    val publicKey: ByteArray? get() = decodeKey(publicKeyB64)
}

sealed class PinDecision {
    /** Key accepted. [newPin] when this is the first key seen for the contact. */
    data class Accept(val pin: KeyPin, val newPin: Boolean) : PinDecision()
    /** The contact's key differs from the one pinned on this device. */
    data class Changed(val pinned: String, val offered: String) : PinDecision()
    /** Malformed key, or the fingerprint sent with it doesn't match. */
    object Invalid : PinDecision()
}

private fun decodeKey(b64: String): ByteArray? = try {
    Base64.getMimeDecoder().decode(b64).takeIf { it.size == 32 }
} catch (_: IllegalArgumentException) { null }

/**
 * Decides whether to trust [publicKeyB64] for a contact whose current pin is
 * [existing]. [fingerprintHint] is the key_fingerprint sent alongside, if any.
 */
fun decidePeerKey(existing: KeyPin?, publicKeyB64: String, fingerprintHint: String?): PinDecision {
    val pk = decodeKey(publicKeyB64) ?: return PinDecision.Invalid
    val fp = keyFingerprint(pk)
    if (!fingerprintHint.isNullOrEmpty() && fingerprintHint != fp) return PinDecision.Invalid
    if (existing != null) {
        return if (existing.fingerprint == fp) PinDecision.Accept(existing, newPin = false)
        else PinDecision.Changed(existing.fingerprint, fp)
    }
    return PinDecision.Accept(KeyPin(fp, Base64.getEncoder().encodeToString(pk)), newPin = true)
}

fun encodePins(pins: Map<String, KeyPin>): String {
    val o = JSONObject()
    for ((peer, pin) in pins) {
        o.put(peer, JSONObject().put("fingerprint", pin.fingerprint).put("public_key", pin.publicKeyB64))
    }
    return o.toString()
}

/** Parses stored pins, dropping rows that are malformed or don't match their fingerprint. */
fun decodePins(raw: String?): Map<String, KeyPin> {
    if (raw.isNullOrBlank()) return emptyMap()
    return try {
        val o = JSONObject(raw)
        val out = mutableMapOf<String, KeyPin>()
        for (peer in o.keys()) {
            val row = o.optJSONObject(peer) ?: continue
            val pin = KeyPin(row.optString("fingerprint"), row.optString("public_key"))
            val pk = pin.publicKey ?: continue
            if (keyFingerprint(pk) == pin.fingerprint) out[peer] = pin
        }
        out
    } catch (_: Exception) { emptyMap() }
}

/**
 * Text to show for a DM body. Plaintext passes through; ciphertext is
 * opened with [open] when a key is known, and anything that can't be opened
 * shows [ENCRYPTED_PLACEHOLDER] rather than hex or a blank bubble.
 */
fun displayDmBody(body: String?, open: ((String) -> String?)?): String {
    if (body.isNullOrEmpty()) return ""
    if (!isEncryptedBody(body)) return body
    val text = open?.let { runCatching { it(body) }.getOrNull() }
    return if (text.isNullOrEmpty()) ENCRYPTED_PLACEHOLDER else text
}
