package world.phazechat.app

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import world.phazechat.app.crypto.KeyBackup
import world.phazechat.app.crypto.KeyBackupBlob

class KeyBackupTest {
    private val pub = ByteArray(32) { it.toByte() }
    private val sec = ByteArray(32) { (100 + it).toByte() }

    @Test fun pinNeedsEightCharacters() {
        assertNotNull(KeyBackup.pinProblem("1234567"))
        assertNull(KeyBackup.pinProblem("12345678"))
        try {
            KeyBackup.encryptKeypair(pub, sec, "short")
            fail("short PIN accepted")
        } catch (_: IllegalArgumentException) {}
    }

    @Test fun newBackupsUse600kAndRoundTrip() {
        val blob = KeyBackup.encryptKeypair(pub, sec, "correct horse")
        assertEquals(600_000, blob.iterations)
        val kp = KeyBackup.decryptKeypair(blob, "correct horse")
        assertArrayEquals(pub, kp.publicKey)
        assertArrayEquals(sec, kp.secretKey)
        try {
            KeyBackup.decryptKeypair(blob, "wrong horse!")
            fail("wrong PIN accepted")
        } catch (e: Exception) {
            assertEquals("Incorrect PIN", e.message)
        }
    }

    @Test fun restoreIterationBounds() {
        assertFalse(KeyBackup.restoreIterationsAllowed(199_999))
        assertTrue(KeyBackup.restoreIterationsAllowed(200_000))
        assertTrue(KeyBackup.restoreIterationsAllowed(600_000))
        assertTrue(KeyBackup.restoreIterationsAllowed(5_000_000))
        assertFalse(KeyBackup.restoreIterationsAllowed(5_000_001))
        val blob = KeyBackup.encryptKeypair(pub, sec, "correct horse")
        try {
            KeyBackup.decryptKeypair(KeyBackupBlob(blob.ciphertext, blob.salt, 1000), "correct horse")
            fail("tampered low iteration count accepted")
        } catch (e: IllegalArgumentException) {
            assertTrue(e.message!!.contains("unsafe"))
        }
    }
}
