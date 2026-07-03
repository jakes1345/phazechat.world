package world.phazechat.app.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

private val Skype7HeaderBlue = Color(0xFF00AFF0)

@Composable
fun Skype7Header(
    me: String,
    status: String,
    mood: String,
    onStatusClick: () -> Unit,
    onMoodClick: () -> Unit,
    onSettings: () -> Unit,
) {
    Column(Modifier.background(Skype7HeaderBlue).statusBarsPadding()) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp),
        ) {
            Box(
                contentAlignment = Alignment.Center,
                modifier = Modifier.size(38.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.25f)),
            ) {
                Text(me.take(1).uppercase(), color = Color.White, fontWeight = FontWeight.Bold)
                Box(Modifier.align(Alignment.BottomEnd)) { PresenceBadge(status, 11.dp) }
            }
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Text(me, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.clickable(onClick = onStatusClick),
                ) {
                    PresenceBadge(status, 9.dp)
                    Spacer(Modifier.width(4.dp))
                    Text(status, color = Color.White.copy(alpha = 0.9f), fontSize = 11.sp)
                }
            }
            IconButton(onClick = onSettings) {
                Text("⚙", color = Color.White, fontSize = 18.sp)
            }
        }
        Text(
            text = mood.ifEmpty { "Share what’s on your mind…" },
            color = Color.White.copy(alpha = if (mood.isEmpty()) 0.6f else 0.9f),
            fontSize = 12.sp,
            fontStyle = if (mood.isEmpty()) FontStyle.Italic else null,
            maxLines = 1,
            modifier = Modifier
                .fillMaxWidth()
                .clickable(onClick = onMoodClick)
                .padding(horizontal = 14.dp)
                .padding(bottom = 8.dp),
        )
    }
}

@Composable
fun Skype7Tabs(selected: Int, onSelect: (Int) -> Unit) {
    Row(Modifier.fillMaxWidth().background(Skype7HeaderBlue)) {
        listOf("recent", "contacts", "spaces").forEachIndexed { i, id ->
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier.weight(1f).clickable { onSelect(i) }.padding(top = 6.dp),
            ) {
                TabIcon(id, active = selected == i)
                Spacer(Modifier.height(5.dp))
                Box(
                    Modifier
                        .fillMaxWidth()
                        .height(3.dp)
                        .background(if (selected == i) Color.White else Color.Transparent)
                )
            }
        }
    }
}

/** Hand-drawn tab glyphs matching the web sidebar icons. */
@Composable
private fun TabIcon(id: String, active: Boolean) {
    val tint = if (active) Color.White else Color.White.copy(alpha = 0.65f)
    Canvas(Modifier.size(20.dp)) {
        val w = size.width
        val stroke = Stroke(width = w * 0.09f)
        when (id) {
            "recent" -> { // clock
                drawCircle(tint, w * 0.38f, center, style = stroke)
                val p = Path().apply {
                    moveTo(w * 0.5f, w * 0.3f); lineTo(w * 0.5f, w * 0.52f); lineTo(w * 0.66f, w * 0.62f)
                }
                drawPath(p, tint, style = stroke)
            }
            "contacts" -> { // person
                drawCircle(tint, w * 0.16f, Offset(w * 0.5f, w * 0.32f), style = stroke)
                val p = Path().apply {
                    moveTo(w * 0.2f, w * 0.85f)
                    cubicTo(w * 0.28f, w * 0.6f, w * 0.72f, w * 0.6f, w * 0.8f, w * 0.85f)
                }
                drawPath(p, tint, style = stroke)
            }
            "spaces" -> { // #
                val sw = w * 0.09f
                drawLine(tint, Offset(w * 0.35f, w * 0.2f), Offset(w * 0.28f, w * 0.8f), sw)
                drawLine(tint, Offset(w * 0.72f, w * 0.2f), Offset(w * 0.65f, w * 0.8f), sw)
                drawLine(tint, Offset(w * 0.2f, w * 0.38f), Offset(w * 0.85f, w * 0.38f), sw)
                drawLine(tint, Offset(w * 0.15f, w * 0.62f), Offset(w * 0.8f, w * 0.62f), sw)
            }
        }
    }
}
