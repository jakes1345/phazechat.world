package world.phazechat.app.data

import org.json.JSONObject

// The wire format of a 1:1 call, shared with the web client (web/src/peerCall.ts)
// and the server (nexus_server/callsignal.go). Plain Kotlin and org.json only,
// so it is covered by unit tests without a device.

/** Sent as `status` on call_offer / call_answer: this client does WebRTC calls. */
const val CALL_RTC = "rtc"

/** TURN relay credentials, from `turn_config` on auth_result. */
data class TurnConfig(
    val url: String,
    val urls: List<String> = emptyList(),
    val username: String = "",
    val password: String = "",
)

fun parseTurnConfig(j: JSONObject?): TurnConfig? {
    j ?: return null
    val url = j.optString("url", "").trim()
    if (url.isEmpty()) return null
    val extra = j.optJSONArray("urls")?.let { arr ->
        (0 until arr.length()).mapNotNull { arr.optString(it, "").trim().ifEmpty { null } }
    } ?: emptyList()
    return TurnConfig(
        url = url,
        urls = extra,
        username = j.optString("username", ""),
        password = j.optString("password", ""),
    )
}

/** One ICE server, before it is turned into org.webrtc's PeerConnection.IceServer. */
data class IceServerSpec(val urls: List<String>, val username: String? = null, val password: String? = null)

/** Public STUN servers, always offered next to any TURN relay (same list as the web client). */
val STUN_SERVERS = IceServerSpec(listOf("stun:stun.cloudflare.com:3478", "stun:stun.l.google.com:19302"))

fun iceServersFor(turn: TurnConfig?): List<IceServerSpec> {
    val list = mutableListOf(STUN_SERVERS)
    if (turn != null && turn.url.isNotBlank()) {
        list += IceServerSpec(listOf(turn.url) + turn.urls, turn.username, turn.password)
    }
    return list
}

/** An ICE candidate as carried in call_signal's `candidate`. */
data class IceCandidateFields(val sdpMid: String?, val sdpMLineIndex: Int, val candidate: String)

/**
 * Encodes a candidate the way a browser's RTCIceCandidate.toJSON() does, so the
 * web client can pass it straight to addIceCandidate().
 */
fun iceCandidateToJson(c: IceCandidateFields): String = JSONObject().apply {
    put("candidate", c.candidate)
    put("sdpMid", c.sdpMid ?: JSONObject.NULL)
    put("sdpMLineIndex", c.sdpMLineIndex)
}.toString()

/**
 * Decodes a candidate from the other side. Returns null for anything that
 * isn't a usable candidate, including the empty end-of-candidates marker
 * some browsers send.
 */
fun parseIceCandidate(json: String?): IceCandidateFields? {
    if (json.isNullOrBlank()) return null
    val j = try { JSONObject(json) } catch (_: Exception) { return null }
    val cand = j.optString("candidate", "")
    if (cand.isBlank()) return null
    val mid = if (j.has("sdpMid") && !j.isNull("sdpMid")) j.optString("sdpMid") else null
    val index = if (j.has("sdpMLineIndex") && !j.isNull("sdpMLineIndex")) j.optInt("sdpMLineIndex", -1) else -1
    if (mid == null && index < 0) return null
    return IceCandidateFields(mid, index.coerceAtLeast(0), cand)
}

/** Where a call's media connection stands (same steps as the web client). */
enum class CallPhase { STARTING, CONNECTING, CONNECTED, RECONNECTING, FAILED, CLOSED }

/** Short status line for the call screen, or null once media is flowing. */
fun callPhaseText(phase: CallPhase?): String? = when (phase) {
    CallPhase.STARTING -> "Starting..."
    CallPhase.CONNECTING -> "Connecting..."
    CallPhase.RECONNECTING -> "Reconnecting..."
    CallPhase.FAILED -> "Call dropped"
    else -> null
}

/**
 * Whether an incoming `call_offer` is a video call. Current clients put the
 * kind ("audio"/"video") in `body`; older ones sent an SDP offer, where a
 * video m-line means video.
 */
fun isVideoOffer(body: String?, sdp: String?): Boolean = when (body) {
    "video" -> true
    "audio" -> false
    else -> sdp?.contains("m=video") == true || body?.contains("m=video") == true
}
