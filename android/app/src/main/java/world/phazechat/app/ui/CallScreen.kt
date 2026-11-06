package world.phazechat.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.addPathNodes
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import kotlinx.coroutines.delay
import org.webrtc.RendererCommon
import org.webrtc.SurfaceViewRenderer
import world.phazechat.app.call.ProxyVideoSink
import world.phazechat.app.call.WebRtc
import world.phazechat.app.data.CallPhase
import world.phazechat.app.data.PhazeViewModel.CallMedia
import world.phazechat.app.data.callPhaseText

/**
 * The whole of a 1:1 call: ringing, then the call itself with the other
 * person's video (or their initial, for a voice call), your own camera in the
 * corner, and mute, camera, flip, speaker and hang-up controls.
 */
@Composable
fun CallScreen(
    peer: String,
    isIncoming: Boolean,
    callStatus: String,
    isVideo: Boolean = false,
    media: CallMedia? = null,
    onAnswer: () -> Unit,
    onReject: () -> Unit,
    onHangUp: () -> Unit,
    onToggleMute: () -> Unit = {},
    onToggleCamera: () -> Unit = {},
    onSwitchCamera: () -> Unit = {},
    onToggleSpeaker: () -> Unit = {},
) {
    var elapsed by remember { mutableIntStateOf(0) }
    val isActive = callStatus == "active"
    val connected = media?.phase == CallPhase.CONNECTED

    // The timer counts while media is flowing and keeps its value through a reconnect.
    LaunchedEffect(connected) {
        if (connected) {
            while (true) {
                delay(1000)
                elapsed++
            }
        }
    }

    val showRemoteVideo = isActive && isVideo && media?.hasRemoteVideo == true
    val showLocalVideo = isActive && media != null && media.hasLocalVideo && !media.cameraOff
    val statusText = when {
        isActive -> callPhaseText(media?.phase) ?: "%d:%02d".format(elapsed / 60, elapsed % 60)
        isIncoming && callStatus == "ringing" -> if (isVideo) "Incoming video call..." else "Incoming call..."
        callStatus == "ringing" -> if (isVideo) "Video calling..." else "Calling..."
        callStatus == "connecting" -> "Connecting..."
        else -> callStatus
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                // Classic deep-teal wash.
                Brush.verticalGradient(
                    listOf(Color(0xFF1D5F7A), Color(0xFF123F53), Color(0xFF0C2C3B))
                )
            ),
        contentAlignment = Alignment.Center,
    ) {
        if (showRemoteVideo && media != null) {
            VideoRenderer(sink = media.remoteSink, mirror = false, onTop = false, modifier = Modifier.fillMaxSize())
        }

        Text(
            "phaze",
            fontSize = 26.sp,
            fontWeight = FontWeight.SemiBold,
            color = Color.White.copy(alpha = 0.14f),
            modifier = Modifier.align(Alignment.TopEnd).statusBarsPadding().padding(18.dp),
        )

        if (showRemoteVideo) {
            // Name and status over the video, top left.
            Surface(
                color = Color(0x990A1820),
                shape = RoundedCornerShape(50),
                modifier = Modifier.align(Alignment.TopStart).statusBarsPadding().padding(14.dp),
            ) {
                Text(
                    "$peer · $statusText",
                    fontSize = 14.sp,
                    color = Color.White,
                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 6.dp),
                )
            }
        } else {
            Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxSize()) {
                Spacer(Modifier.weight(1f))
                Box(
                    modifier = Modifier
                        .size(96.dp)
                        .clip(RoundedCornerShape(6.dp))
                        .background(avatarTint(peer)),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(peer.firstOrNull()?.uppercase() ?: "?", fontSize = 40.sp, fontWeight = FontWeight.Bold, color = Color.White)
                }
                Spacer(Modifier.height(16.dp))
                Text(peer, fontSize = 22.sp, fontWeight = FontWeight.SemiBold, color = Color.White)
                Spacer(Modifier.height(4.dp))
                Text(statusText, fontSize = 14.sp, color = Color.White.copy(alpha = 0.7f))
                Spacer(Modifier.weight(1f))
                Spacer(Modifier.height(120.dp))
            }
        }

        if (showLocalVideo && media != null) {
            VideoRenderer(
                sink = media.localSink,
                mirror = media.frontCamera,
                onTop = true,
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .navigationBarsPadding()
                    .padding(end = 16.dp, bottom = 120.dp)
                    .size(width = 108.dp, height = 152.dp),
            )
        }

        // Controls: one dark rounded bar, classic style.
        Surface(
            color = Color(0xD00A1820),
            shape = RoundedCornerShape(50),
            modifier = Modifier.align(Alignment.BottomCenter).navigationBarsPadding().padding(bottom = 32.dp),
        ) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(16.dp),
                modifier = Modifier.padding(horizontal = 18.dp, vertical = 10.dp),
            ) {
                when {
                    isIncoming && callStatus == "ringing" -> {
                        CallButton(CallIcons.CallEnd, "Decline", PhazeDanger, onReject)
                        CallButton(CallIcons.Call, "Answer", PhazeSuccess, onAnswer)
                    }
                    isActive && media != null -> {
                        CallToggle(
                            if (media.muted) CallIcons.MicOff else CallIcons.Mic,
                            if (media.muted) "Unmute" else "Mute",
                            active = media.muted, onClick = onToggleMute,
                        )
                        if (media.hasLocalVideo) {
                            CallToggle(
                                if (media.cameraOff) CallIcons.VideocamOff else CallIcons.Videocam,
                                if (media.cameraOff) "Camera on" else "Camera off",
                                active = media.cameraOff, onClick = onToggleCamera,
                            )
                            CallToggle(CallIcons.Flip, "Flip", active = false, enabled = !media.cameraOff, onClick = onSwitchCamera)
                        }
                        CallToggle(CallIcons.Speaker, "Speaker", active = media.speakerOn, onClick = onToggleSpeaker)
                        CallButton(CallIcons.CallEnd, "End", PhazeDanger, onHangUp)
                    }
                    else -> CallButton(CallIcons.CallEnd, "End", PhazeDanger, onHangUp)
                }
            }
        }
    }
}

/** Shows one call video. The renderer is attached to [sink] while it's on screen. */
@Composable
private fun VideoRenderer(sink: ProxyVideoSink, mirror: Boolean, onTop: Boolean, modifier: Modifier) {
    key(sink) {
        AndroidView(
            factory = { ctx ->
                SurfaceViewRenderer(ctx).apply {
                    init(WebRtc.eglBase.eglBaseContext, null)
                    setScalingType(RendererCommon.ScalingType.SCALE_ASPECT_FILL)
                    setEnableHardwareScaler(true)
                    // The small self view sits above the full-screen one.
                    if (onTop) setZOrderMediaOverlay(true)
                    sink.setTarget(this)
                }
            },
            update = { it.setMirror(mirror) },
            onRelease = {
                sink.setTarget(null)
                it.release()
            },
            modifier = modifier,
        )
    }
}

@Composable
fun CallButton(icon: ImageVector, label: String, color: Color, onClick: () -> Unit) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        FilledIconButton(
            onClick = onClick,
            modifier = Modifier.size(56.dp),
            colors = IconButtonDefaults.filledIconButtonColors(containerColor = color),
        ) {
            Icon(icon, contentDescription = label, tint = Color.White, modifier = Modifier.size(26.dp))
        }
        Spacer(Modifier.height(4.dp))
        Text(label, fontSize = 11.sp, color = Color.White.copy(alpha = 0.7f))
    }
}

/** A call control that stays lit while it's on (muted, camera off, speaker on). */
@Composable
private fun CallToggle(icon: ImageVector, label: String, active: Boolean, enabled: Boolean = true, onClick: () -> Unit) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        FilledIconButton(
            onClick = onClick,
            enabled = enabled,
            modifier = Modifier.size(48.dp),
            colors = IconButtonDefaults.filledIconButtonColors(
                containerColor = if (active) Color.White else Color.White.copy(alpha = 0.16f),
                disabledContainerColor = Color.White.copy(alpha = 0.06f),
            ),
        ) {
            Icon(
                icon, contentDescription = label,
                tint = if (active) Color(0xFF0C2C3B) else Color.White.copy(alpha = if (enabled) 1f else 0.4f),
                modifier = Modifier.size(22.dp),
            )
        }
        Spacer(Modifier.height(4.dp))
        Text(label, fontSize = 11.sp, color = Color.White.copy(alpha = 0.7f))
    }
}

/** Material Design call icons (Apache 2.0), drawn from their 24dp path data. */
private object CallIcons {
    private fun icon(name: String, path: String) = ImageVector.Builder(
        name = name, defaultWidth = 24.dp, defaultHeight = 24.dp, viewportWidth = 24f, viewportHeight = 24f,
    ).addPath(pathData = addPathNodes(path), fill = SolidColor(Color.White)).build()

    val Call = icon("Call", "M20.01,15.38c-1.23,0 -2.42,-0.2 -3.53,-0.56 -0.35,-0.12 -0.74,-0.03 -1.01,0.24l-1.57,1.97c-2.83,-1.35 -5.48,-3.9 -6.89,-6.83l1.95,-1.66c0.27,-0.28 0.35,-0.67 0.24,-1.02 -0.37,-1.11 -0.56,-2.3 -0.56,-3.53 0,-0.54 -0.45,-0.99 -0.99,-0.99H4.19C3.65,3 3,3.24 3,3.99 3,13.28 10.73,21 20.01,21c0.71,0 0.99,-0.63 0.99,-1.18v-3.45c0,-0.54 -0.45,-0.99 -0.99,-0.99z")
    val CallEnd = icon("CallEnd", "M12,9c-1.6,0 -3.15,0.25 -4.6,0.72v3.1c0,0.39 -0.23,0.74 -0.56,0.9 -0.98,0.49 -1.87,1.12 -2.66,1.85 -0.18,0.18 -0.43,0.28 -0.7,0.28 -0.28,0 -0.53,-0.11 -0.71,-0.29L0.29,13.08c-0.18,-0.17 -0.29,-0.42 -0.29,-0.7 0,-0.28 0.11,-0.53 0.29,-0.71C3.34,8.78 7.46,7 12,7s8.66,1.78 11.71,4.67c0.18,0.18 0.29,0.43 0.29,0.71 0,0.28 -0.11,0.53 -0.29,0.71l-2.48,2.48c-0.18,0.18 -0.43,0.29 -0.71,0.29 -0.27,0 -0.52,-0.11 -0.7,-0.28 -0.79,-0.74 -1.69,-1.36 -2.67,-1.85 -0.33,-0.16 -0.56,-0.5 -0.56,-0.9v-3.1C15.15,9.25 13.6,9 12,9z")
    val Mic = icon("Mic", "M12,14c1.66,0 2.99,-1.34 2.99,-3L15,5c0,-1.66 -1.34,-3 -3,-3S9,3.34 9,5v6c0,1.66 1.34,3 3,3zM17.3,11c0,3 -2.54,5.1 -5.3,5.1S6.7,14 6.7,11L5,11c0,3.41 2.72,6.23 6,6.72L11,21h2v-3.28c3.28,-0.48 6,-3.3 6,-6.72h-1.7z")
    val MicOff = icon("MicOff", "M19,11h-1.7c0,0.74 -0.16,1.43 -0.43,2.05l1.23,1.23c0.56,-0.98 0.9,-2.09 0.9,-3.28zM14.98,11.17c0,-0.06 0.02,-0.11 0.02,-0.17L15,5c0,-1.66 -1.34,-3 -3,-3S9,3.34 9,5v0.18l5.98,5.99zM4.27,3L3,4.27l6.01,6.01L9,11c0,1.66 1.33,3 2.99,3 0.22,0 0.44,-0.03 0.65,-0.08l1.66,1.66c-0.71,0.33 -1.5,0.52 -2.31,0.52 -2.76,0 -5.3,-2.1 -5.3,-5.1L5,11c0,3.41 2.72,6.23 6,6.72L11,21h2v-3.28c0.91,-0.13 1.77,-0.45 2.54,-0.9L19.73,21 21,19.73 4.27,3z")
    val Videocam = icon("Videocam", "M17,10.5V7c0,-0.55 -0.45,-1 -1,-1H4c-0.55,0 -1,0.45 -1,1v10c0,0.55 0.45,1 1,1h12c0.55,0 1,-0.45 1,-1v-3.5l4,4v-11l-4,4z")
    val VideocamOff = icon("VideocamOff", "M21,6.5l-4,4V7c0,-0.55 -0.45,-1 -1,-1H9.82L21,17.18V6.5zM3.27,2L2,3.27 4.73,6H4c-0.55,0 -1,0.45 -1,1v10c0,0.55 0.45,1 1,1h12c0.21,0 0.39,-0.08 0.54,-0.18L19.73,21 21,19.73 3.27,2z")
    val Speaker = icon("Speaker", "M3,9v6h4l5,5V4L7,9H3zM16.5,12c0,-1.77 -1.02,-3.29 -2.5,-4.03v8.05c1.48,-0.73 2.5,-2.25 2.5,-4.02zM14,3.23v2.06c2.89,0.86 5,3.54 5,6.71s-2.11,5.85 -5,6.71v2.06c4.01,-0.91 7,-4.49 7,-8.77s-2.99,-7.86 -7,-8.77z")
    val Flip = icon("Flip", "M20,4h-3.17L15,2H9L7.17,4H4c-1.1,0 -2,0.9 -2,2v12c0,1.1 0.9,2 2,2h16c1.1,0 2,-0.9 2,-2V6c0,-1.1 -0.9,-2 -2,-2zM15,15.5V13H9v2.5L5.5,12 9,8.5V11h6V8.5l3.5,3.5 -3.5,3.5z")
}
