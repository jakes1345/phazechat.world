package world.phazechat.app.call

import android.content.Context
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.asCoroutineDispatcher
import kotlinx.coroutines.cancel
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import org.webrtc.AudioSource
import org.webrtc.AudioTrack
import org.webrtc.DataChannel
import org.webrtc.DefaultVideoDecoderFactory
import org.webrtc.DefaultVideoEncoderFactory
import org.webrtc.IceCandidate
import org.webrtc.MediaConstraints
import org.webrtc.MediaStream
import org.webrtc.PeerConnection
import org.webrtc.PeerConnectionFactory
import org.webrtc.RtpTransceiver
import org.webrtc.SdpObserver
import org.webrtc.SessionDescription
import org.webrtc.audio.JavaAudioDeviceModule
import world.phazechat.app.data.CallPhase
import world.phazechat.app.data.IceCandidateFields
import world.phazechat.app.data.IceServerSpec
import world.phazechat.app.data.iceCandidateToJson
import world.phazechat.app.data.parseIceCandidate
import java.util.concurrent.Executors
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/** One other person in the room, as the UI sees them. */
data class VoicePeerView(val name: String, val phase: CallPhase, val micOn: Boolean)

/**
 * The Android side of web/src/voiceMesh.ts: a voice room where every member
 * holds one direct connection to every other member. The server keeps the
 * member list (voice_peers) and relays voice_signal; media goes peer to peer
 * or through TURN.
 *
 * Audio only for now. When a web member sends video, the connection to this
 * phone answers the video section as inactive, so nothing is sent our way
 * that we couldn't show. All WebRTC work runs, in order, on one thread.
 */
class VoiceMesh(
    context: Context,
    private val me: String,
    iceServers: List<IceServerSpec>,
    private val events: Events,
) {
    interface Events {
        /** Send a voice_signal to one member of the room. */
        fun signal(to: String, body: String, sdp: String? = null, candidate: String? = null)
        /** The peer list or someone's connection / mic state changed. */
        fun onPeers(peers: List<VoicePeerView>)
        /** The room can't go on (WebRTC or the microphone failed). */
        fun onMediaError(message: String)
    }

    private class Link(val name: String, val pc: PeerConnection) {
        val pendingIce = mutableListOf<IceCandidate>()
        var phase = CallPhase.CONNECTING
        var micOn = true
        var restarted = false
        var disconnectJob: Job? = null
        var audio: RtpTransceiver? = null
        var video: RtpTransceiver? = null
    }

    private val appContext = context.applicationContext
    private val servers: List<PeerConnection.IceServer> = iceServers.map { s ->
        PeerConnection.IceServer.builder(s.urls)
            .setUsername(s.username ?: "")
            .setPassword(s.password ?: "")
            .createIceServer()
    }

    private val executor = Executors.newSingleThreadExecutor { r -> Thread(r, "phaze-voice") }
    private val scope = CoroutineScope(SupervisorJob() + executor.asCoroutineDispatcher())
    private val ops = Channel<suspend () -> Unit>(Channel.UNLIMITED)

    private var factory: PeerConnectionFactory? = null
    private var audioSource: AudioSource? = null
    private var audioTrack: AudioTrack? = null
    private val links = LinkedHashMap<String, Link>()
    private var muted = false
    @Volatile private var closed = false

    init {
        scope.launch {
            for (op in ops) {
                if (closed) break
                try { op() } catch (e: Exception) { Log.w(TAG, "voice step failed", e) }
            }
        }
    }

    private fun enqueue(op: suspend () -> Unit) { if (!closed) ops.trySend(op) }

    /** Opens the microphone. Call once, before the first [setPeers]. */
    fun start() = enqueue { startInternal() }

    /** Applies a voice_peers list from the server. */
    fun setPeers(listed: List<String>) = enqueue { setPeersInternal(listed) }

    /** Feeds in a voice_signal from another member. */
    fun handle(from: String?, body: String?, sdp: String?, candidate: String?) =
        enqueue { handleInternal(from, body, sdp, candidate) }

    fun setMuted(value: Boolean) = enqueue {
        muted = value
        audioTrack?.setEnabled(!value)
        links.keys.forEach { sendState(it) }
    }

    fun close() {
        if (closed) return
        closed = true
        ops.close()
        scope.cancel()
        executor.execute { release() }
        executor.shutdown()
    }

    private suspend fun startInternal() {
        val f = try {
            createFactory()
        } catch (e: Throwable) {
            Log.e(TAG, "WebRTC failed to start", e)
            events.onMediaError("Voice channels couldn't start on this phone.")
            return
        }
        factory = f
        audioSource = f.createAudioSource(MediaConstraints())
        audioTrack = f.createAudioTrack("phaze-voice", audioSource).also { it.setEnabled(!muted) }
    }

    private fun createFactory(): PeerConnectionFactory {
        WebRtc.ensureInitialized(appContext)
        val egl = WebRtc.eglBase.eglBaseContext
        val adm = JavaAudioDeviceModule.builder(appContext)
            .setUseHardwareAcousticEchoCanceler(JavaAudioDeviceModule.isBuiltInAcousticEchoCancelerSupported())
            .setUseHardwareNoiseSuppressor(JavaAudioDeviceModule.isBuiltInNoiseSuppressorSupported())
            .setAudioRecordErrorCallback(object : JavaAudioDeviceModule.AudioRecordErrorCallback {
                override fun onWebRtcAudioRecordInitError(msg: String?) = micFailed(msg)
                override fun onWebRtcAudioRecordStartError(code: JavaAudioDeviceModule.AudioRecordStartErrorCode?, msg: String?) = micFailed(msg)
                override fun onWebRtcAudioRecordError(msg: String?) { Log.w(TAG, "mic: $msg") }
            })
            .createAudioDeviceModule()
        val f = PeerConnectionFactory.builder()
            .setAudioDeviceModule(adm)
            .setVideoEncoderFactory(DefaultVideoEncoderFactory(egl, true, true))
            .setVideoDecoderFactory(DefaultVideoDecoderFactory(egl))
            .createPeerConnectionFactory()
        adm.release()
        return f
    }

    private fun micFailed(msg: String?) {
        Log.e(TAG, "mic failed: $msg")
        if (!closed) events.onMediaError("Couldn't open your microphone. It may be in use by another app.")
    }

    private fun setPeersInternal(listed: List<String>) {
        val f = factory ?: return
        val diff = diffPeers(me, links.keys, listed.take(MAX_VOICE_PEERS))
        diff.remove.forEach { dropLink(it) }
        for (name in diff.add) {
            val link = openLink(f, name) ?: continue
            if (isOfferer(me, name)) enqueue { makeOffer(link, iceRestart = false) }
        }
        if (diff.add.isNotEmpty() || diff.remove.isNotEmpty()) publish()
    }

    private fun openLink(f: PeerConnectionFactory, name: String): Link? {
        val config = PeerConnection.RTCConfiguration(servers).apply {
            sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN
            bundlePolicy = PeerConnection.BundlePolicy.MAXBUNDLE
            continualGatheringPolicy = PeerConnection.ContinualGatheringPolicy.GATHER_CONTINUALLY
        }
        lateinit var link: Link
        val conn = f.createPeerConnection(config, observerFor(name) { link }) ?: run {
            events.onMediaError("Voice channels couldn't start on this phone.")
            return null
        }
        link = Link(name, conn)
        links[name] = link
        if (isOfferer(me, name)) {
            // The offering side creates the audio section; the answering side
            // picks it up from the offer (see bindTransceivers).
            audioTrack?.let { link.audio = conn.addTransceiver(it, sendRecvInit()) }
        }
        return link
    }

    private fun sendRecvInit() = RtpTransceiver.RtpTransceiverInit(RtpTransceiver.RtpTransceiverDirection.SEND_RECV)

    /** The answering side picks up the transceivers the offer created. */
    private fun bindTransceivers(link: Link) {
        for (t in link.pc.transceivers) {
            when (t.mediaType) {
                org.webrtc.MediaStreamTrack.MediaType.MEDIA_TYPE_AUDIO -> if (link.audio == null) {
                    link.audio = t
                    t.direction = RtpTransceiver.RtpTransceiverDirection.SEND_RECV
                    t.sender.setTrack(audioTrack, false)
                }
                org.webrtc.MediaStreamTrack.MediaType.MEDIA_TYPE_VIDEO -> if (link.video == null) {
                    link.video = t
                    // Audio-only on this phone: don't ask the other side to send video.
                    t.direction = RtpTransceiver.RtpTransceiverDirection.INACTIVE
                }
                else -> {}
            }
        }
    }

    private suspend fun handleInternal(from: String?, body: String?, sdp: String?, candidate: String?) {
        if (from.isNullOrEmpty() || from == me) return
        val f = factory ?: return
        var link = links[from]
        if (body == "offer" && link == null) link = openLink(f, from)
        if (link == null) return
        val conn = link.pc
        when (body) {
            "offer" -> {
                if (sdp.isNullOrEmpty()) return
                conn.awaitSetRemote(SessionDescription(SessionDescription.Type.OFFER, sdp))
                bindTransceivers(link)
                flushIce(link)
                val answer = conn.awaitCreate(offer = false)
                conn.awaitSetLocal(answer)
                if (!closed) {
                    events.signal(from, "answer", sdp = answer.description)
                    sendState(from)
                }
            }
            "answer" -> {
                if (sdp.isNullOrEmpty()) return
                if (conn.signalingState() != PeerConnection.SignalingState.HAVE_LOCAL_OFFER) return
                conn.awaitSetRemote(SessionDescription(SessionDescription.Type.ANSWER, sdp))
                flushIce(link)
                sendState(from)
            }
            "ice" -> {
                val c = parseIceCandidate(candidate) ?: return
                val ice = IceCandidate(c.sdpMid, c.sdpMLineIndex, c.candidate)
                if (conn.remoteDescription != null) conn.addIceCandidate(ice) else link.pendingIce += ice
            }
            "media" -> {
                val st = parseMediaState(sdp) ?: return
                link.micOn = st.mic
                publish()
            }
        }
    }

    private fun flushIce(link: Link) {
        val list = link.pendingIce.toList()
        link.pendingIce.clear()
        list.forEach { link.pc.addIceCandidate(it) }
    }

    private suspend fun makeOffer(link: Link, iceRestart: Boolean) {
        if (links[link.name] !== link) return
        val conn = link.pc
        if (iceRestart) conn.restartIce()
        val offer = conn.awaitCreate(offer = true)
        conn.awaitSetLocal(offer)
        if (!closed) events.signal(link.name, "offer", sdp = offer.description)
    }

    private fun sendState(to: String) {
        if (closed) return
        events.signal(to, "media", sdp = encodeMediaState(VoiceMediaState(mic = !muted)))
    }

    private fun publish() {
        if (closed) return
        events.onPeers(
            links.values.map { VoicePeerView(it.name, it.phase, it.micOn) }.sortedBy { it.name }
        )
    }

    private fun onConnectionState(link: Link, state: PeerConnection.PeerConnectionState) {
        if (closed || links[link.name] !== link) return
        if (state != PeerConnection.PeerConnectionState.DISCONNECTED) {
            link.disconnectJob?.cancel()
            link.disconnectJob = null
        }
        when (state) {
            PeerConnection.PeerConnectionState.CONNECTED -> {
                link.restarted = false
                link.phase = CallPhase.CONNECTED
            }
            PeerConnection.PeerConnectionState.DISCONNECTED -> {
                link.phase = CallPhase.RECONNECTING
                if (link.disconnectJob == null) {
                    link.disconnectJob = scope.launch {
                        delay(DISCONNECT_GRACE_MS)
                        enqueue { restart(link) }
                    }
                }
            }
            PeerConnection.PeerConnectionState.FAILED -> {
                link.phase = CallPhase.FAILED
                enqueue { restart(link) }
            }
            else -> {}
        }
        publish()
    }

    private suspend fun restart(link: Link) {
        if (closed || link.restarted || links[link.name] !== link) return
        if (link.pc.connectionState() == PeerConnection.PeerConnectionState.CONNECTED) return
        link.restarted = true
        // The offering side renegotiates with fresh ICE; the other side answers it.
        if (isOfferer(me, link.name)) makeOffer(link, iceRestart = true)
    }

    private fun dropLink(name: String) {
        val link = links.remove(name) ?: return
        link.disconnectJob?.cancel()
        try { link.pc.dispose() } catch (e: Exception) { Log.w(TAG, "closing link", e) }
    }

    private fun observerFor(name: String, link: () -> Link) = object : PeerConnection.Observer {
        override fun onIceCandidate(c: IceCandidate) {
            if (closed) return
            events.signal(name, "ice", candidate = iceCandidateToJson(IceCandidateFields(c.sdpMid, c.sdpMLineIndex, c.sdp)))
        }
        override fun onConnectionChange(newState: PeerConnection.PeerConnectionState) {
            enqueue { onConnectionState(link(), newState) }
        }
        override fun onSignalingChange(state: PeerConnection.SignalingState?) {}
        override fun onIceConnectionChange(state: PeerConnection.IceConnectionState?) {}
        override fun onIceConnectionReceivingChange(receiving: Boolean) {}
        override fun onIceGatheringChange(state: PeerConnection.IceGatheringState?) {}
        override fun onIceCandidatesRemoved(candidates: Array<out IceCandidate>?) {}
        override fun onAddStream(stream: MediaStream?) {}
        override fun onRemoveStream(stream: MediaStream?) {}
        override fun onDataChannel(channel: DataChannel?) {}
        override fun onRenegotiationNeeded() {}
    }

    /** Frees everything, on the voice thread, once the room is left. */
    private fun release() {
        try {
            links.keys.toList().forEach { dropLink(it) }
            audioSource?.dispose()
            factory?.dispose()
        } catch (e: Exception) {
            Log.w(TAG, "releasing voice room", e)
        }
        audioSource = null; audioTrack = null; factory = null
    }

    private suspend fun PeerConnection.awaitCreate(offer: Boolean): SessionDescription =
        suspendCancellableCoroutine { cont ->
            val obs = object : SdpObserver {
                override fun onCreateSuccess(desc: SessionDescription) { if (cont.isActive) cont.resume(desc) }
                override fun onCreateFailure(error: String?) {
                    if (cont.isActive) cont.resumeWithException(IllegalStateException("create ${if (offer) "offer" else "answer"}: $error"))
                }
                override fun onSetSuccess() {}
                override fun onSetFailure(error: String?) {}
            }
            if (offer) createOffer(obs, MediaConstraints()) else createAnswer(obs, MediaConstraints())
        }

    private suspend fun PeerConnection.awaitSetLocal(desc: SessionDescription) = awaitSet { setLocalDescription(it, desc) }
    private suspend fun PeerConnection.awaitSetRemote(desc: SessionDescription) = awaitSet { setRemoteDescription(it, desc) }

    private suspend fun awaitSet(call: (SdpObserver) -> Unit): Unit = suspendCancellableCoroutine { cont ->
        call(object : SdpObserver {
            override fun onSetSuccess() { if (cont.isActive) cont.resume(Unit) }
            override fun onSetFailure(error: String?) {
                if (cont.isActive) cont.resumeWithException(IllegalStateException("set description: $error"))
            }
            override fun onCreateSuccess(desc: SessionDescription?) {}
            override fun onCreateFailure(error: String?) {}
        })
    }

    companion object {
        private const val TAG = "VoiceMesh"
        private const val DISCONNECT_GRACE_MS = 4000L
    }
}
