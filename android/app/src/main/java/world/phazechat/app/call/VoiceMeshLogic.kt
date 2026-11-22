package world.phazechat.app.call

import org.json.JSONObject

// Voice rooms (Spaces voice channels and group calls) are a small mesh: each
// person holds one WebRTC connection to every other person, and the server
// only keeps the member list (voice_peers) and relays voice_signal. This file
// is the plain-Kotlin half of the Android side, kept free of org.webrtc so it
// is covered by unit tests. It mirrors web/src/voiceMesh.ts, and the two
// must agree on who offers and on the "media" signal's shape.

/** Mesh rooms get heavy fast: every member uploads a stream to every other. */
const val MAX_VOICE_PEERS = 8

/** What a member is sending, shared with the others over voice_signal "media". */
data class VoiceMediaState(val mic: Boolean = true, val cam: Boolean = false, val screen: Boolean = false)

/**
 * Which side of a pair makes the offer. Both sides compute the same answer
 * from the two names, so two members never offer to each other at once.
 * Plain string order, to match the web client's `me < peer`.
 */
fun isOfferer(me: String, peer: String): Boolean = me < peer

data class PeerDiff(val add: List<String>, val remove: List<String>)

/** Diffs the server's member list against the open connections. */
fun diffPeers(me: String, current: Collection<String>, listed: List<String>): PeerDiff {
    val want = listed.filter { it.isNotEmpty() && it != me }.toSet()
    val have = current.toSet()
    return PeerDiff(
        add = (want - have).sorted(),
        remove = (have - want).sorted(),
    )
}

fun encodeMediaState(state: VoiceMediaState): String = JSONObject().apply {
    put("mic", state.mic)
    put("cam", state.cam)
    put("screen", state.screen)
}.toString()

fun parseMediaState(raw: String?): VoiceMediaState? {
    if (raw.isNullOrBlank()) return null
    val j = try { JSONObject(raw) } catch (_: Exception) { return null }
    return VoiceMediaState(
        mic = !j.has("mic") || j.optBoolean("mic", true),
        cam = j.optBoolean("cam", false),
        screen = j.optBoolean("screen", false),
    )
}
