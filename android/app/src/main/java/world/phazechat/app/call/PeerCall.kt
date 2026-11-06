package world.phazechat.app.call

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.util.Log
import androidx.core.content.ContextCompat
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
import org.webrtc.Camera2Enumerator
import org.webrtc.CameraVideoCapturer
import org.webrtc.DataChannel
import org.webrtc.DefaultVideoDecoderFactory
import org.webrtc.DefaultVideoEncoderFactory
import org.webrtc.EglBase
import org.webrtc.IceCandidate
import org.webrtc.MediaConstraints
import org.webrtc.MediaStream
import org.webrtc.PeerConnection
import org.webrtc.PeerConnectionFactory
import org.webrtc.RtpTransceiver
import org.webrtc.SdpObserver
import org.webrtc.SessionDescription
import org.webrtc.SurfaceTextureHelper
import org.webrtc.VideoFrame
import org.webrtc.VideoSink
import org.webrtc.VideoSource
import org.webrtc.VideoTrack
import org.webrtc.audio.JavaAudioDeviceModule
import world.phazechat.app.data.CallPhase
import world.phazechat.app.data.IceCandidateFields
import world.phazechat.app.data.IceServerSpec
import world.phazechat.app.data.iceCandidateToJson
import world.phazechat.app.data.parseIceCandidate
import java.util.concurrent.Executors
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/** Process-wide WebRTC setup: initialised once, one EGL context shared by encoders and renderers. */
object WebRtc {
    val eglBase: EglBase by lazy { EglBase.create() }
    private var initialized = false

    @Synchronized
    fun ensureInitialized(context: Context) {
        if (initialized) return
        PeerConnectionFactory.initialize(
            PeerConnectionFactory.InitializationOptions.builder(context.applicationContext)
                .createInitializationOptions()
        )
        initialized = true
    }
}

/**
 * Forwards video frames to whichever renderer is on screen right now, so the
 * UI never touches a WebRTC track directly (tracks are freed when the call
 * ends, while a renderer may still be on its way out).
 */
class ProxyVideoSink : VideoSink {
    private var target: VideoSink? = null

    @Synchronized
    fun setTarget(sink: VideoSink?) { target = sink }

    @Synchronized
    override fun onFrame(frame: VideoFrame) { target?.onFrame(frame) }
}

/**
 * One 1:1 call over WebRTC: the Android side of web/src/peerCall.ts, and it
 * speaks the same call_signal messages so either end can be web or Android.
 *
 * The server rings, pairs the two connections and relays call_signal
 * (offer / answer / ice). The caller makes the offer. Media goes peer to peer,
 * or through the TURN relay from turn_config when a direct path isn't possible.
 *
 * All WebRTC work runs, in order, on one thread of its own.
 */
class PeerCall(
    context: Context,
    val video: Boolean,
    val isCaller: Boolean,
    iceServers: List<IceServerSpec>,
    private val events: Events,
) {
    interface Events {
        /** Send a call_signal to the other side. */
        fun signal(body: String, sdp: String? = null, candidate: String? = null)
        fun onPhase(phase: CallPhase)
        /** Whether this phone is sending video, and from the front camera. */
        fun onLocalVideo(present: Boolean, frontFacing: Boolean)
        fun onRemoteVideo(present: Boolean)
        /** The call can't go on (no audio or WebRTC couldn't start). */
        fun onMediaError(message: String)
    }

    val localSink = ProxyVideoSink()
    val remoteSink = ProxyVideoSink()

    private val appContext = context.applicationContext
    private val servers: List<PeerConnection.IceServer> = iceServers.map { s ->
        PeerConnection.IceServer.builder(s.urls)
            .setUsername(s.username ?: "")
            .setPassword(s.password ?: "")
            .createIceServer()
    }

    private val executor = Executors.newSingleThreadExecutor { r -> Thread(r, "phaze-call") }
    private val scope = CoroutineScope(SupervisorJob() + executor.asCoroutineDispatcher())
    private val ops = Channel<suspend () -> Unit>(Channel.UNLIMITED)

    private var factory: PeerConnectionFactory? = null
    private var pc: PeerConnection? = null
    private var audioSource: AudioSource? = null
    private var audioTrack: AudioTrack? = null
    private var videoSource: VideoSource? = null
    private var videoTrack: VideoTrack? = null
    private var capturer: CameraVideoCapturer? = null
    private var textureHelper: SurfaceTextureHelper? = null
    private var frontFacing = true
    private var cameraOff = false
    private val pendingIce = mutableListOf<IceCandidate>()
    private var restarted = false
    private var disconnectJob: Job? = null
    @Volatile private var closed = false

    init {
        // One consumer: offers, answers and candidates are applied strictly in
        // the order they arrived, each one finished before the next starts.
        scope.launch {
            for (op in ops) {
                if (closed) break
                try { op() } catch (e: Exception) { Log.w(TAG, "call step failed", e) }
            }
        }
    }

    private fun enqueue(op: suspend () -> Unit) { if (!closed) ops.trySend(op) }

    /** Opens the microphone (and camera), then, as the caller, makes the offer. */
    fun start() = enqueue { startInternal() }

    /** Feeds in a call_signal from the other side. */
    fun handle(body: String?, sdp: String?, candidate: String?) = enqueue { handleInternal(body, sdp, candidate) }

    fun setMuted(muted: Boolean) = enqueue { audioTrack?.setEnabled(!muted) }

    fun setCameraOff(off: Boolean) = enqueue {
        if (cameraOff == off) return@enqueue
        cameraOff = off
        videoTrack?.setEnabled(!off)
        val cam = capturer ?: return@enqueue
        // Stop the camera itself too, so its light goes off and it stops using battery.
        try {
            if (off) cam.stopCapture() else cam.startCapture(CAPTURE_WIDTH, CAPTURE_HEIGHT, CAPTURE_FPS)
        } catch (e: Exception) { Log.w(TAG, "camera toggle", e) }
    }

    fun switchCamera() = enqueue {
        val cam = capturer ?: return@enqueue
        cam.switchCamera(object : CameraVideoCapturer.CameraSwitchHandler {
            override fun onCameraSwitchDone(isFront: Boolean) {
                frontFacing = isFront
                events.onLocalVideo(true, isFront)
            }
            override fun onCameraSwitchError(error: String?) { Log.w(TAG, "switch camera: $error") }
        })
    }

    fun close() {
        if (closed) return
        closed = true
        localSink.setTarget(null)
        remoteSink.setTarget(null)
        ops.close()
        scope.cancel()
        executor.execute { release() }
        executor.shutdown()
        events.onPhase(CallPhase.CLOSED)
    }

    private suspend fun startInternal() {
        events.onPhase(CallPhase.STARTING)
        val f = try {
            createFactory()
        } catch (e: Throwable) {
            Log.e(TAG, "WebRTC failed to start", e)
            events.onMediaError("Calls couldn't start on this phone.")
            return
        }
        factory = f

        audioSource = f.createAudioSource(MediaConstraints())
        audioTrack = f.createAudioTrack("phaze-audio", audioSource).also { it.setEnabled(true) }
        if (video) startCamera(f)

        val config = PeerConnection.RTCConfiguration(servers).apply {
            sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN
            bundlePolicy = PeerConnection.BundlePolicy.MAXBUNDLE
            // Keep gathering so a switch between Wi-Fi and mobile data can recover.
            continualGatheringPolicy = PeerConnection.ContinualGatheringPolicy.GATHER_CONTINUALLY
        }
        val conn = f.createPeerConnection(config, observer)
        if (conn == null) {
            events.onMediaError("Calls couldn't start on this phone.")
            return
        }
        pc = conn
        audioTrack?.let { conn.addTrack(it, listOf(STREAM_ID)) }
        videoTrack?.let { conn.addTrack(it, listOf(STREAM_ID)) }
        events.onPhase(CallPhase.CONNECTING)
        if (isCaller) makeOffer()
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
        // The factory holds its own reference.
        adm.release()
        return f
    }

    private fun micFailed(msg: String?) {
        Log.e(TAG, "mic failed: $msg")
        if (!closed) events.onMediaError("Couldn't open your microphone. It may be in use by another app.")
    }

    private fun startCamera(f: PeerConnectionFactory) {
        if (ContextCompat.checkSelfPermission(appContext, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            // Camera permission refused: carry on as a voice call from this side.
            events.onLocalVideo(false, false)
            return
        }
        val enumerator = Camera2Enumerator(appContext)
        val names = enumerator.deviceNames.toList()
        val name = names.firstOrNull { enumerator.isFrontFacing(it) } ?: names.firstOrNull()
        val cam = name?.let { enumerator.createCapturer(it, cameraEvents) }
        if (cam == null) {
            // No camera: carry on as a voice call from this side.
            events.onLocalVideo(false, false)
            return
        }
        frontFacing = enumerator.isFrontFacing(name)
        val helper = SurfaceTextureHelper.create("phaze-camera", WebRtc.eglBase.eglBaseContext)
        val source = f.createVideoSource(false)
        cam.initialize(helper, appContext, source.capturerObserver)
        cam.startCapture(CAPTURE_WIDTH, CAPTURE_HEIGHT, CAPTURE_FPS)
        val track = f.createVideoTrack("phaze-video", source)
        track.setEnabled(true)
        track.addSink(localSink)
        capturer = cam
        textureHelper = helper
        videoSource = source
        videoTrack = track
        events.onLocalVideo(true, frontFacing)
    }

    private val cameraEvents = object : CameraVideoCapturer.CameraEventsHandler {
        override fun onCameraError(error: String?) { Log.w(TAG, "camera error: $error") }
        override fun onCameraDisconnected() { Log.w(TAG, "camera disconnected") }
        override fun onCameraFreezed(error: String?) { Log.w(TAG, "camera froze: $error") }
        override fun onCameraOpening(name: String?) {}
        override fun onFirstFrameAvailable() {}
        override fun onCameraClosed() {}
    }

    private suspend fun handleInternal(body: String?, sdp: String?, candidate: String?) {
        val conn = pc ?: return
        when (body) {
            "offer" -> {
                if (sdp.isNullOrEmpty()) return
                conn.awaitSetRemote(SessionDescription(SessionDescription.Type.OFFER, sdp))
                flushIce()
                val answer = conn.awaitCreate(offer = false)
                conn.awaitSetLocal(answer)
                if (!closed) events.signal("answer", sdp = answer.description)
            }
            "answer" -> {
                if (sdp.isNullOrEmpty()) return
                if (conn.signalingState() != PeerConnection.SignalingState.HAVE_LOCAL_OFFER) return
                conn.awaitSetRemote(SessionDescription(SessionDescription.Type.ANSWER, sdp))
                flushIce()
            }
            "ice" -> {
                val c = parseIceCandidate(candidate) ?: return
                val ice = IceCandidate(c.sdpMid, c.sdpMLineIndex, c.candidate)
                if (conn.remoteDescription != null) conn.addIceCandidate(ice) else pendingIce += ice
            }
        }
    }

    private fun flushIce() {
        val conn = pc ?: return
        val list = pendingIce.toList()
        pendingIce.clear()
        list.forEach { conn.addIceCandidate(it) }
    }

    private suspend fun makeOffer() {
        val conn = pc ?: return
        val offer = conn.awaitCreate(offer = true)
        conn.awaitSetLocal(offer)
        if (!closed) events.signal("offer", sdp = offer.description)
    }

    private suspend fun onConnectionState(state: PeerConnection.PeerConnectionState) {
        if (closed || pc == null) return
        if (state != PeerConnection.PeerConnectionState.DISCONNECTED) {
            disconnectJob?.cancel()
            disconnectJob = null
        }
        when (state) {
            PeerConnection.PeerConnectionState.CONNECTED -> events.onPhase(CallPhase.CONNECTED)
            PeerConnection.PeerConnectionState.DISCONNECTED -> {
                events.onPhase(CallPhase.RECONNECTING)
                // A brief network blip often recovers by itself; if it
                // doesn't, the caller renegotiates with fresh ICE.
                if (disconnectJob == null) {
                    disconnectJob = scope.launch {
                        delay(DISCONNECT_GRACE_MS)
                        enqueue { tryRestart() }
                    }
                }
            }
            PeerConnection.PeerConnectionState.FAILED -> tryRestart()
            else -> {}
        }
    }

    private suspend fun tryRestart() {
        val conn = pc ?: return
        if (closed) return
        val st = conn.connectionState()
        if (st == PeerConnection.PeerConnectionState.CONNECTED) return
        if (restarted) {
            events.onPhase(CallPhase.FAILED)
            return
        }
        restarted = true
        events.onPhase(CallPhase.RECONNECTING)
        if (isCaller) {
            conn.restartIce()
            makeOffer()
        }
        // The callee waits for the caller's new offer.
    }

    private val observer = object : PeerConnection.Observer {
        override fun onIceCandidate(c: IceCandidate) {
            if (closed) return
            events.signal("ice", candidate = iceCandidateToJson(IceCandidateFields(c.sdpMid, c.sdpMLineIndex, c.sdp)))
        }
        override fun onTrack(transceiver: RtpTransceiver) {
            val track = transceiver.receiver?.track()
            if (track is VideoTrack) {
                track.addSink(remoteSink)
                events.onRemoteVideo(true)
            }
        }
        override fun onConnectionChange(newState: PeerConnection.PeerConnectionState) {
            enqueue { onConnectionState(newState) }
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

    /** Frees everything, on the call thread, once the call is over. */
    private fun release() {
        disconnectJob?.cancel()
        try {
            capturer?.let { cam ->
                if (!cameraOff) try { cam.stopCapture() } catch (_: InterruptedException) {}
                cam.dispose()
            }
            pc?.dispose()
            videoSource?.dispose()
            audioSource?.dispose()
            textureHelper?.dispose()
            factory?.dispose()
        } catch (e: Exception) {
            Log.w(TAG, "releasing call", e)
        }
        capturer = null; pc = null; videoSource = null; audioSource = null
        textureHelper = null; factory = null; videoTrack = null; audioTrack = null
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
        private const val TAG = "PeerCall"
        private const val STREAM_ID = "phaze"
        private const val CAPTURE_WIDTH = 1280
        private const val CAPTURE_HEIGHT = 720
        private const val CAPTURE_FPS = 30
        private const val DISCONNECT_GRACE_MS = 4000L
    }
}
