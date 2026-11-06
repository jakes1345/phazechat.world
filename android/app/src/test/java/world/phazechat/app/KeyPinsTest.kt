package world.phazechat.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import world.phazechat.app.crypto.ENCRYPTED_PLACEHOLDER
import world.phazechat.app.crypto.KeyPin
import world.phazechat.app.crypto.PinDecision
import world.phazechat.app.crypto.decidePeerKey
import world.phazechat.app.crypto.decodePins
import world.phazechat.app.crypto.displayDmBody
import world.phazechat.app.crypto.encodePins
import world.phazechat.app.crypto.keyFingerprint
import java.util.Base64

class KeyPinsTest {
    private fun key(seed: Int) = ByteArray(32) { (it + seed).toByte() }
    private fun b64(k: ByteArray) = Base64.getEncoder().encodeToString(k)

    @Test fun fingerprintMatchesWebFormat() {
        // First 8 bytes of SHA-256 as 16 lowercase hex chars.
        val fp = keyFingerprint(ByteArray(32))
        assertEquals("66687aadf862bd77", fp)
    }

    @Test fun firstKeyIsPinned() {
        val d = decidePeerKey(null, b64(key(1)), null)
        assertTrue(d is PinDecision.Accept && d.newPin)
        assertEquals(keyFingerprint(key(1)), (d as PinDecision.Accept).pin.fingerprint)
    }

    @Test fun sameKeyAcceptedWithoutRepinning() {
        val pin = KeyPin(keyFingerprint(key(1)), b64(key(1)))
        val d = decidePeerKey(pin, b64(key(1)), keyFingerprint(key(1)))
        assertTrue(d is PinDecision.Accept && !d.newPin)
    }

    @Test fun changedKeyIsRefused() {
        val pin = KeyPin(keyFingerprint(key(1)), b64(key(1)))
        val d = decidePeerKey(pin, b64(key(2)), null)
        assertTrue(d is PinDecision.Changed)
        d as PinDecision.Changed
        assertEquals(keyFingerprint(key(1)), d.pinned)
        assertEquals(keyFingerprint(key(2)), d.offered)
    }

    @Test fun badFingerprintHintOrMalformedKeyIsInvalid() {
        assertEquals(PinDecision.Invalid, decidePeerKey(null, b64(key(1)), "0000000000000000"))
        assertEquals(PinDecision.Invalid, decidePeerKey(null, b64(ByteArray(16)), null))
        assertEquals(PinDecision.Invalid, decidePeerKey(null, "not base64!!", null))
    }

    @Test fun pinsRoundTripAndTamperedRowsDropped() {
        val pins = mapOf(
            "alice" to KeyPin(keyFingerprint(key(1)), b64(key(1))),
            "bob" to KeyPin(keyFingerprint(key(2)), b64(key(2))),
        )
        assertEquals(pins, decodePins(encodePins(pins)))
        // A row whose key doesn't match its fingerprint is not trusted.
        val tampered = encodePins(mapOf("eve" to KeyPin(keyFingerprint(key(1)), b64(key(3)))))
        assertTrue(decodePins(tampered).isEmpty())
        assertTrue(decodePins(null).isEmpty())
        assertTrue(decodePins("{garbage").isEmpty())
    }

    @Test fun dmBodyNeverShowsHexOrBlank() {
        assertEquals("hello", displayDmBody("hello", null))
        assertEquals(ENCRYPTED_PLACEHOLDER, displayDmBody("E2EE:abcdef", null))
        assertEquals(ENCRYPTED_PLACEHOLDER, displayDmBody("E2EE:abcdef") { "" })
        assertEquals(ENCRYPTED_PLACEHOLDER, displayDmBody("E2EE:abcdef") { throw IllegalStateException() })
        assertEquals("secret", displayDmBody("E2EE:abcdef") { "secret" })
        assertEquals("", displayDmBody(null, null))
    }

    @Test fun pinPublicKeyDecodes() {
        assertNull(KeyPin("x", "%%%").publicKey)
        assertEquals(32, KeyPin("x", b64(key(5))).publicKey?.size)
    }
}
