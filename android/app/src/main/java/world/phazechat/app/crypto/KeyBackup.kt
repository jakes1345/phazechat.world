package world.phazechat.app.crypto

import org.json.JSONObject
import java.security.SecureRandom
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.PBEKeySpec
import javax.crypto.spec.SecretKeySpec

data class KeyBackupBlob(
    val ciphertext: String,
    val salt: String,
    val iterations: Int
)

object KeyBackup {
    // Same parameters and wire format as web/src/keyBackup.ts. New backups
    // use 600k PBKDF2 iterations (OWASP guidance for PBKDF2-SHA256); older
    // ones were written with 200k. The count comes back from the server, so
    // restore refuses anything outside 200k..5M: a tampered blob could
    // otherwise make the PIN cheap to guess (or hang the device).
    const val ITERATIONS = 600_000
    const val MIN_RESTORE_ITERATIONS = 200_000
    const val MAX_RESTORE_ITERATIONS = 5_000_000
    /** Recovery PINs shorter than this are refused. */
    const val MIN_PIN_LENGTH = 8
    private const val SALT_BYTES = 16
    private const val IV_BYTES = 12
    private const val KEY_LENGTH = 256

    private fun b64(bytes: ByteArray): String = Base64.getEncoder().encodeToString(bytes)
    private fun unb64(str: String): ByteArray = Base64.getMimeDecoder().decode(str)

    /** Null when [pin] is acceptable for a new backup, else the reason it isn't. */
    fun pinProblem(pin: String): String? =
        if (pin.length < MIN_PIN_LENGTH) "PIN must be at least $MIN_PIN_LENGTH characters" else null

    fun restoreIterationsAllowed(iterations: Int): Boolean =
        iterations in MIN_RESTORE_ITERATIONS..MAX_RESTORE_ITERATIONS

    fun encryptKeypair(pub: ByteArray, sec: ByteArray, pin: String): KeyBackupBlob {
        pinProblem(pin)?.let { throw IllegalArgumentException(it) }
        
        val random = SecureRandom()
        val salt = ByteArray(SALT_BYTES)
        random.nextBytes(salt)

        // PBKDF2 key derivation
        val spec = PBEKeySpec(pin.toCharArray(), salt, ITERATIONS, KEY_LENGTH)
        val factory = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
        val derivedKeyBytes = factory.generateSecret(spec).encoded
        val secretKeySpec = SecretKeySpec(derivedKeyBytes, "AES")

        val iv = ByteArray(IV_BYTES)
        random.nextBytes(iv)

        // Payload JSON
        val payload = JSONObject().apply {
            put("pub", b64(pub))
            put("sec", b64(sec))
        }.toString()

        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        val gcmSpec = GCMParameterSpec(128, iv)
        cipher.init(Cipher.ENCRYPT_MODE, secretKeySpec, gcmSpec)
        val ct = cipher.doFinal(payload.toByteArray(Charsets.UTF_8))

        // Combined = IV + ciphertext
        val combined = ByteArray(iv.size + ct.size)
        System.arraycopy(iv, 0, combined, 0, iv.size)
        System.arraycopy(ct, 0, combined, iv.size, ct.size)

        return KeyBackupBlob(
            ciphertext = b64(combined),
            salt = b64(salt),
            iterations = ITERATIONS
        )
    }

    fun decryptKeypair(blob: KeyBackupBlob, pin: String): NaClKeyPair {
        val salt = unb64(blob.salt)
        val combined = unb64(blob.ciphertext)
        if (combined.size < IV_BYTES + 16) throw IllegalArgumentException("Backup blob malformed")

        val iv = combined.sliceArray(0 until IV_BYTES)
        val ct = combined.sliceArray(IV_BYTES until combined.size)

        val iterations = if (blob.iterations <= 0) ITERATIONS else blob.iterations
        if (!restoreIterationsAllowed(iterations)) {
            throw IllegalArgumentException("This backup uses unsafe settings and was not restored")
        }

        // PBKDF2 key derivation
        val spec = PBEKeySpec(pin.toCharArray(), salt, iterations, KEY_LENGTH)
        val factory = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
        val derivedKeyBytes = factory.generateSecret(spec).encoded
        val secretKeySpec = SecretKeySpec(derivedKeyBytes, "AES")

        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        val gcmSpec = GCMParameterSpec(128, iv)
        cipher.init(Cipher.DECRYPT_MODE, secretKeySpec, gcmSpec)
        
        val decryptedBytes = try {
            cipher.doFinal(ct)
        } catch (e: Exception) {
            throw Exception("Incorrect PIN")
        }

        val json = JSONObject(String(decryptedBytes, Charsets.UTF_8))
        val pub = unb64(json.getString("pub"))
        val sec = unb64(json.getString("sec"))

        if (pub.size != 32 || sec.size != 32) throw Exception("Backup contained malformed keys")
        return NaClKeyPair(pub, sec)
    }
}
