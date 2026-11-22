package world.phazechat.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import world.phazechat.app.call.VoiceMediaState
import world.phazechat.app.call.diffPeers
import world.phazechat.app.call.encodeMediaState
import world.phazechat.app.call.isOfferer
import world.phazechat.app.call.parseMediaState

class VoiceMeshLogicTest {
    @Test
    fun exactlyOneSideOffers() {
        assertTrue(isOfferer("alice", "bob"))
        assertFalse(isOfferer("bob", "alice"))
    }

    @Test
    fun offererOrderIsPlainStringOrderLikeTheWebClient() {
        // Uppercase sorts before lowercase in both JS and Kotlin string compare.
        assertTrue(isOfferer("Zed", "adam"))
        assertFalse(isOfferer("adam", "Zed"))
    }

    @Test
    fun diffAddsNewMembersAndDropsGoneOnes() {
        val d = diffPeers("me", listOf("bob", "carol"), listOf("me", "bob", "dave", "alice"))
        assertEquals(listOf("alice", "dave"), d.add)
        assertEquals(listOf("carol"), d.remove)
    }

    @Test
    fun diffIgnoresSelfAndBlankNames() {
        val d = diffPeers("me", emptyList(), listOf("me", "", "bob"))
        assertEquals(listOf("bob"), d.add)
        assertTrue(d.remove.isEmpty())
    }

    @Test
    fun mediaStateRoundTripsAndMatchesWebShape() {
        val s = VoiceMediaState(mic = false, cam = true, screen = false)
        assertEquals(s, parseMediaState(encodeMediaState(s)))
        // The web client sends exactly these three booleans.
        assertEquals(VoiceMediaState(mic = true, cam = false, screen = true), parseMediaState("""{"mic":true,"cam":false,"screen":true}"""))
    }

    @Test
    fun mediaStateDefaultsMicOnAndRejectsGarbage() {
        assertEquals(VoiceMediaState(mic = true), parseMediaState("{}"))
        assertNull(parseMediaState(null))
        assertNull(parseMediaState("not json"))
    }
}
