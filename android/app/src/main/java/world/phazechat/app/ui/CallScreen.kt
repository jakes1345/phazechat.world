package world.phazechat.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay

/**
 * Ringing / connecting screen for a 1:1 call. Once the call is answered the
 * conference itself runs in the Jitsi Meet SDK's own activity, which has the
 * mute, camera, speaker and screen-share controls; while it's open this screen
 * only offers to go back to it or to end the call.
 */
@Composable
fun CallScreen(
    peer: String,
    isIncoming: Boolean,
    callStatus: String,
    isVideo: Boolean = false,
    onAnswer: () -> Unit,
    onReject: () -> Unit,
    onHangUp: () -> Unit,
    onReturnToCall: () -> Unit = {},
) {
    var elapsed by remember { mutableIntStateOf(0) }
    val isActive = callStatus == "active"

    LaunchedEffect(isActive) {
        if (isActive) {
            while (true) {
                delay(1000)
                elapsed++
            }
        }
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
        Text(
            "phaze",
            fontSize = 26.sp,
            fontWeight = FontWeight.SemiBold,
            color = Color.White.copy(alpha = 0.14f),
            modifier = Modifier.align(Alignment.TopEnd).padding(18.dp),
        )

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

            Text(
                when {
                    isActive -> "%d:%02d".format(elapsed / 60, elapsed % 60)
                    isIncoming && callStatus == "ringing" -> if (isVideo) "Incoming video call..." else "Incoming call..."
                    callStatus == "ringing" -> if (isVideo) "Video calling..." else "Calling..."
                    callStatus == "connecting" -> "Connecting..."
                    else -> callStatus
                },
                fontSize = 14.sp,
                color = Color.White.copy(alpha = 0.7f),
            )

            Spacer(Modifier.weight(1f))

            // Controls — one dark rounded bar, classic style.
            Surface(
                color = Color(0xD00A1820),
                shape = RoundedCornerShape(50),
                modifier = Modifier.padding(bottom = 40.dp),
            ) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(32.dp),
                    modifier = Modifier.padding(horizontal = 22.dp, vertical = 10.dp),
                ) {
                    when {
                        isIncoming && callStatus == "ringing" -> {
                            CallButton(text = "Decline", color = PhazeDanger) { onReject() }
                            CallButton(text = "Answer", color = PhazeSuccess) { onAnswer() }
                        }
                        isActive -> {
                            CallButton(text = "Return", color = Color(0xFF0095CC)) { onReturnToCall() }
                            CallButton(text = "End", color = PhazeDanger) { onHangUp() }
                        }
                        else -> CallButton(text = "End", color = PhazeDanger) { onHangUp() }
                    }
                }
            }
        }
    }
}

@Composable
fun CallButton(text: String, color: Color, onClick: () -> Unit) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        FilledIconButton(
            onClick = onClick,
            modifier = Modifier.size(56.dp),
            colors = IconButtonDefaults.filledIconButtonColors(containerColor = color),
        ) {
            Text(
                when (text) {
                    "Return" -> "📹"
                    "End", "Decline" -> "📴"
                    "Answer" -> "📞"
                    else -> "?"
                },
                fontSize = 22.sp,
            )
        }
        Spacer(Modifier.height(4.dp))
        Text(text, fontSize = 11.sp, color = Color.White.copy(alpha = 0.7f))
    }
}
