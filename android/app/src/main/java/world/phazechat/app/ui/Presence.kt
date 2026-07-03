package world.phazechat.app.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

val STATUSES = listOf("Online", "Away", "Do Not Disturb", "Invisible")

/** Skype-7-style presence dot, drawn by hand — no third-party art. */
@Composable
fun PresenceBadge(status: String, size: Dp = 12.dp) {
    Canvas(modifier = Modifier.size(size)) {
        val r = this.size.minDimension / 2f
        val c = Offset(r, r)
        when (status) {
            "Online" -> {
                drawCircle(Color(0xFF7BA700), r, c)
                val p = Path().apply {
                    moveTo(r * 0.55f, r * 1.05f); lineTo(r * 0.9f, r * 1.4f); lineTo(r * 1.5f, r * 0.65f)
                }
                drawPath(p, Color.White, style = Stroke(width = r * 0.28f))
            }
            "Away" -> {
                drawCircle(Color(0xFFFCAF17), r, c)
                val p = Path().apply { moveTo(r, r * 0.5f); lineTo(r, r * 1.05f); lineTo(r * 1.4f, r * 1.3f) }
                drawPath(p, Color.White, style = Stroke(width = r * 0.25f))
            }
            "Do Not Disturb" -> {
                drawCircle(Color(0xFFE4141B), r, c)
                drawLine(Color.White, Offset(r * 0.5f, r), Offset(r * 1.5f, r), strokeWidth = r * 0.3f)
            }
            else -> { // Offline / Invisible
                drawCircle(Color(0xFFA9A9A9), r * 0.85f, c, style = Stroke(width = r * 0.26f))
                drawLine(Color(0xFFA9A9A9), Offset(r * 0.65f, r * 0.65f), Offset(r * 1.35f, r * 1.35f), strokeWidth = r * 0.22f)
                drawLine(Color(0xFFA9A9A9), Offset(r * 1.35f, r * 0.65f), Offset(r * 0.65f, r * 1.35f), strokeWidth = r * 0.22f)
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StatusPickerSheet(current: String, onPick: (String) -> Unit, onDismiss: () -> Unit) {
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(Modifier.padding(bottom = 24.dp)) {
            STATUSES.forEach { s ->
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { onPick(s); onDismiss() }
                        .padding(horizontal = 20.dp, vertical = 12.dp),
                ) {
                    PresenceBadge(s)
                    Spacer(Modifier.width(12.dp))
                    Text(
                        s,
                        style = MaterialTheme.typography.bodyLarge,
                        fontWeight = if (s == current) FontWeight.Bold else null,
                    )
                }
            }
        }
    }
}
