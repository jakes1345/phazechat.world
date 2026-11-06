package world.phazechat.app

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import world.phazechat.app.data.CallPhase
import world.phazechat.app.data.IceCandidateFields
import world.phazechat.app.data.NexusMessage
import world.phazechat.app.data.STUN_SERVERS
import world.phazechat.app.data.TurnConfig
import world.phazechat.app.data.callPhaseText
import world.phazechat.app.data.iceCandidateToJson
import world.phazechat.app.data.iceServersFor
import world.phazechat.app.data.isVideoOffer
import world.phazechat.app.data.parseIceCandidate
import world.phazechat.app.data.parseTurnConfig

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

    @Test fun turnConfigFromAuthResult() {
        val msg = NexusMessage.fromJson(JSONObject(
            """{"type":"auth_result","status":"ok","sender":"amy",
               "turn_config":{"url":"turn:turn.example:3478?transport=udp",
               "urls":["turns:turn.example:5349?transport=tcp",""],
               "username":"u1","password":"p1"}}"""
        ))
        val turn = msg.turnConfig!!
        assertEquals("turn:turn.example:3478?transport=udp", turn.url)
        assertEquals(listOf("turns:turn.example:5349?transport=tcp"), turn.urls)
        assertEquals("u1", turn.username)
        assertEquals("p1", turn.password)
    }

    @Test fun turnConfigWithoutUrlIsIgnored() {
        assertNull(parseTurnConfig(JSONObject("""{"url":"","username":"u"}""")))
        assertNull(parseTurnConfig(null))
        assertNull(NexusMessage.fromJson(JSONObject("""{"type":"auth_result"}""")).turnConfig)
    }

    @Test fun iceServersAlwaysIncludeStun() {
        assertEquals(listOf(STUN_SERVERS), iceServersFor(null))
        val servers = iceServersFor(TurnConfig("turn:a:3478", listOf("turns:a:5349"), "u", "p"))
        assertEquals(2, servers.size)
        assertEquals(listOf("turn:a:3478", "turns:a:5349"), servers[1].urls)
        assertEquals("u", servers[1].username)
        assertEquals("p", servers[1].password)
    }

    @Test fun candidateRoundTripsInBrowserFormat() {
        val c = IceCandidateFields("0", 0, "candidate:1 1 udp 2122260223 192.0.2.1 54400 typ host")
        val json = iceCandidateToJson(c)
        val j = JSONObject(json)
        // Same keys as RTCIceCandidate.toJSON(), so the web client can use it as is.
        assertEquals(c.candidate, j.getString("candidate"))
        assertEquals("0", j.getString("sdpMid"))
        assertEquals(0, j.getInt("sdpMLineIndex"))
        assertEquals(c, parseIceCandidate(json))
    }

    @Test fun candidateFromBrowser() {
        val fromChrome = """{"candidate":"candidate:2 1 udp 1686052607 203.0.113.5 61000 typ srflx","sdpMid":"1","sdpMLineIndex":1,"usernameFragment":"abcd"}"""
        assertEquals(IceCandidateFields("1", 1, "candidate:2 1 udp 1686052607 203.0.113.5 61000 typ srflx"), parseIceCandidate(fromChrome))
        // A candidate with only a mid still names its m-line.
        assertEquals("0", parseIceCandidate("""{"candidate":"candidate:3","sdpMid":"0","sdpMLineIndex":null}""")?.sdpMid)
    }

    @Test fun unusableCandidatesAreDropped() {
        assertNull(parseIceCandidate(null))
        assertNull(parseIceCandidate(""))
        assertNull(parseIceCandidate("not json"))
        // End-of-candidates marker.
        assertNull(parseIceCandidate("""{"candidate":"","sdpMid":"0","sdpMLineIndex":0}"""))
        // No m-line to attach it to.
        assertNull(parseIceCandidate("""{"candidate":"candidate:1"}"""))
    }

    @Test fun callSignalCarriesSdpAndCandidate() {
        val j = NexusMessage(type = "call_signal", sender = "amy", recipient = "bo", body = "ice", candidate = "{\"candidate\":\"x\"}").toJson()
        assertEquals("ice", j.getString("body"))
        assertEquals("{\"candidate\":\"x\"}", j.getString("candidate"))
        assertFalse(j.has("sdp"))
        val back = NexusMessage.fromJson(JSONObject("""{"type":"call_signal","sender":"bo","body":"answer","sdp":"v=0"}"""))
        assertEquals("v=0", back.sdp)
        assertNull(back.candidate)
    }

    @Test fun phaseText() {
        assertEquals("Connecting...", callPhaseText(CallPhase.CONNECTING))
        assertEquals("Reconnecting...", callPhaseText(CallPhase.RECONNECTING))
        assertNull(callPhaseText(CallPhase.CONNECTED))
        assertNull(callPhaseText(null))
    }
}
