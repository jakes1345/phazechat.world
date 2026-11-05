package world.phazechat.app

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import world.phazechat.app.data.conferenceUrlMatchesRoom
import world.phazechat.app.data.isVideoOffer

class CallSignallingTest {
    @Test fun offerKindComesFromBody() {
        assertTrue(isVideoOffer("video", null))
        assertFalse(isVideoOffer("audio", null))
    }

    @Test fun bodyKindWinsOverSdp() {
        assertFalse(isVideoOffer("audio", "v=0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n"))
    }

    @Test fun olderClientsSendSdp() {
        assertTrue(isVideoOffer(null, "v=0\r\nm=audio 9 UDP\r\nm=video 9 UDP\r\n"))
        assertFalse(isVideoOffer(null, "v=0\r\nm=audio 9 UDP\r\n"))
        // Old native clients put the SDP offer in body.
        assertTrue(isVideoOffer("v=0\r\nm=video 9 UDP\r\n", null))
        assertFalse(isVideoOffer(null, null))
    }

    @Test fun conferenceEndMatchesItsRoom() {
        assertTrue(conferenceUrlMatchesRoom("https://meet.jit.si/phaze-abc123", "phaze-abc123"))
        assertTrue(conferenceUrlMatchesRoom("https://meet.jit.si/phaze-ABC123/?x=1#config.a=b", "phaze-abc123"))
        assertFalse(conferenceUrlMatchesRoom("https://meet.jit.si/phaze-old", "phaze-abc123"))
        assertFalse(conferenceUrlMatchesRoom("https://meet.jit.si/xphaze-abc123", "phaze-abc123"))
    }

    @Test fun conferenceEndWithoutUrlStillCounts() {
        assertTrue(conferenceUrlMatchesRoom(null, "phaze-abc123"))
        assertTrue(conferenceUrlMatchesRoom("https://meet.jit.si/phaze-abc123", null))
    }
}
