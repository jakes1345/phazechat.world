package world.phazechat.app.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.text.InlineTextContent
import androidx.compose.foundation.text.appendInlineContent
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.text.Placeholder
import androidx.compose.ui.text.PlaceholderVerticalAlign
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em

private val Face = Color(0xFFFFD764)
private val Rim = Color(0xFFB98A00)
private val Ink = Color(0xFF5B4300)

/** One drawn face per id, same house style as the web set. Unicode fallback. */
@Composable
fun EmoticonGlyph(id: String, size: Dp = 20.dp) {
    val known = EMOTICONS.any { it.id == id }
    if (!known) {
        Text(EMOTICONS.find { it.id == id }?.emoji ?: id)
        return
    }
    Canvas(Modifier.size(size)) { drawEmoticon(id) }
}

private fun DrawScope.drawEmoticon(id: String) {
    val w = size.width
    val c = center
    val stroke = Stroke(width = w * 0.06f)

    fun eyes(y: Float = 0.4f) {
        drawCircle(Ink, w * 0.055f, Offset(w * 0.34f, w * y))
        drawCircle(Ink, w * 0.055f, Offset(w * 0.66f, w * y))
    }

    fun face(color: Color = Face, rim: Color = Rim) {
        drawCircle(color, w * 0.45f, c)
        drawCircle(rim, w * 0.45f, c, style = stroke)
    }

    fun mouth(startX: Float, curveY: Float, endX: Float, down: Boolean = false) {
        val edgeY = if (down) 0.72f else 0.6f
        val p = Path().apply {
            moveTo(w * startX, w * edgeY)
            quadraticBezierTo(w * 0.5f, w * curveY, w * endX, w * edgeY)
        }
        drawPath(p, Ink, style = Stroke(width = w * 0.07f))
    }

    when (id) {
        "smile" -> { face(); eyes(); mouth(0.3f, 0.78f, 0.7f) }
        "laugh" -> { face(); eyes(0.36f); drawCircle(Ink, w * 0.16f, Offset(w * 0.5f, w * 0.65f)) }
        "wink" -> {
            face(); drawCircle(Ink, w * 0.055f, Offset(w * 0.34f, w * 0.4f))
            drawLine(Ink, Offset(w * 0.58f, w * 0.4f), Offset(w * 0.74f, w * 0.4f), w * 0.06f)
            mouth(0.3f, 0.76f, 0.7f)
        }
        "sad" -> { face(); eyes(); mouth(0.3f, 0.58f, 0.7f, down = true) }
        "cry" -> {
            face(); eyes(); mouth(0.3f, 0.6f, 0.7f, down = true)
            drawCircle(Color(0xFF6FB9E8), w * 0.07f, Offset(w * 0.3f, w * 0.58f))
        }
        "wave" -> {
            face(); eyes(); mouth(0.32f, 0.74f, 0.62f)
            drawCircle(Face, w * 0.11f, Offset(w * 0.88f, w * 0.3f))
            drawCircle(Rim, w * 0.11f, Offset(w * 0.88f, w * 0.3f), style = Stroke(w * 0.04f))
        }
        "heart" -> {
            val p = Path().apply {
                moveTo(w * 0.5f, w * 0.85f)
                cubicTo(w * 0.05f, w * 0.5f, w * 0.2f, w * 0.12f, w * 0.5f, w * 0.32f)
                cubicTo(w * 0.8f, w * 0.12f, w * 0.95f, w * 0.5f, w * 0.5f, w * 0.85f)
            }
            drawPath(p, Color(0xFFE4141B))
        }
        "kiss" -> { face(); eyes(); drawCircle(Color(0xFFE86A6A), w * 0.09f, Offset(w * 0.5f, w * 0.66f)) }
        "cool" -> {
            face()
            drawLine(Ink, Offset(w * 0.2f, w * 0.4f), Offset(w * 0.8f, w * 0.4f), w * 0.16f)
            mouth(0.32f, 0.74f, 0.68f)
        }
        "angry" -> {
            face(Color(0xFFE86A4A), Color(0xFF9C3D22))
            drawLine(Ink, Offset(w * 0.26f, w * 0.3f), Offset(w * 0.42f, w * 0.38f), w * 0.05f)
            drawLine(Ink, Offset(w * 0.74f, w * 0.3f), Offset(w * 0.58f, w * 0.38f), w * 0.05f)
            eyes(0.46f); mouth(0.32f, 0.6f, 0.68f, down = true)
        }
        "surprised" -> { face(); eyes(0.38f); drawCircle(Ink, w * 0.11f, Offset(w * 0.5f, w * 0.66f)) }
        "blush" -> {
            face(); eyes()
            drawCircle(Color(0xFFF2A3A3), w * 0.07f, Offset(w * 0.22f, w * 0.56f))
            drawCircle(Color(0xFFF2A3A3), w * 0.07f, Offset(w * 0.78f, w * 0.56f))
            mouth(0.34f, 0.74f, 0.66f)
        }
        "tongue" -> {
            face(); eyes(); mouth(0.3f, 0.7f, 0.7f)
            drawCircle(Color(0xFFE86A6A), w * 0.09f, Offset(w * 0.56f, w * 0.72f))
        }
        "sweat" -> {
            face(); eyes()
            drawLine(Ink, Offset(w * 0.32f, w * 0.66f), Offset(w * 0.68f, w * 0.66f), w * 0.06f)
            drawCircle(Color(0xFF6FB9E8), w * 0.08f, Offset(w * 0.82f, w * 0.24f))
        }
        "party" -> {
            face(); eyes(0.46f); mouth(0.32f, 0.8f, 0.68f)
            val hat = Path().apply {
                moveTo(w * 0.42f, w * 0.16f); lineTo(w * 0.62f, w * 0.02f); lineTo(w * 0.64f, w * 0.24f); close()
            }
            drawPath(hat, Color(0xFF0095CC))
        }
        "sleepy" -> {
            face()
            drawLine(Ink, Offset(w * 0.26f, w * 0.42f), Offset(w * 0.42f, w * 0.42f), w * 0.055f)
            drawLine(Ink, Offset(w * 0.58f, w * 0.42f), Offset(w * 0.74f, w * 0.42f), w * 0.055f)
            mouth(0.36f, 0.7f, 0.64f)
        }
        "think" -> {
            face(); eyes(0.42f)
            drawLine(Ink, Offset(w * 0.24f, w * 0.26f), Offset(w * 0.4f, w * 0.22f), w * 0.05f)
            drawLine(Ink, Offset(w * 0.36f, w * 0.68f), Offset(w * 0.52f, w * 0.66f), w * 0.06f)
        }
        "yes", "no" -> {
            val p = Path().apply {
                moveTo(w * 0.3f, w * 0.5f); lineTo(w * 0.45f, w * 0.22f)
                quadraticBezierTo(w * 0.52f, w * 0.12f, w * 0.56f, w * 0.26f)
                lineTo(w * 0.52f, w * 0.44f); lineTo(w * 0.78f, w * 0.44f)
                quadraticBezierTo(w * 0.88f, w * 0.46f, w * 0.84f, w * 0.58f)
                lineTo(w * 0.76f, w * 0.85f); lineTo(w * 0.3f, w * 0.85f); close()
            }
            if (id == "no") {
                scale(scaleX = 1f, scaleY = -1f) {
                    drawPath(p, Face); drawPath(p, Rim, style = stroke)
                }
            } else {
                drawPath(p, Face); drawPath(p, Rim, style = stroke)
            }
        }
        "hug" -> {
            face(); eyes(); mouth(0.34f, 0.72f, 0.66f)
            drawLine(Rim, Offset(w * 0.06f, w * 0.6f), Offset(w * 0.3f, w * 0.9f), w * 0.08f)
            drawLine(Rim, Offset(w * 0.94f, w * 0.6f), Offset(w * 0.7f, w * 0.9f), w * 0.08f)
        }
        else -> { face(); eyes(); mouth(0.3f, 0.76f, 0.7f) }
    }
}

/** Message body with classic shortcuts swapped for drawn faces. */
@Composable
fun EmoticonText(
    text: String,
    modifier: Modifier = Modifier,
    color: Color = Color.Unspecified,
    fontSize: androidx.compose.ui.unit.TextUnit = androidx.compose.ui.unit.TextUnit.Unspecified,
    lineHeight: androidx.compose.ui.unit.TextUnit = androidx.compose.ui.unit.TextUnit.Unspecified,
) {
    val tokens = tokenize(text)
    val inline = mutableMapOf<String, InlineTextContent>()
    val annotated = buildAnnotatedString {
        tokens.forEach { t ->
            when (t) {
                is EmoToken.Text -> append(t.value)
                is EmoToken.Emo -> {
                    val key = "emo-${t.id}"
                    inline.getOrPut(key) {
                        InlineTextContent(Placeholder(1.3.em, 1.3.em, PlaceholderVerticalAlign.TextCenter)) {
                            EmoticonGlyph(t.id)
                        }
                    }
                    appendInlineContent(key, t.shortcut)
                }
            }
        }
    }
    Text(annotated, inlineContent = inline, modifier = modifier, color = color, fontSize = fontSize, lineHeight = lineHeight)
}

@Composable
fun EmoticonPickerPanel(onPick: (String) -> Unit) {
    LazyVerticalGrid(
        columns = GridCells.Fixed(8),
        modifier = Modifier.height(120.dp).padding(horizontal = 8.dp),
    ) {
        items(EMOTICONS, key = { it.id }) { e ->
            Box(Modifier.padding(6.dp).clickable { onPick(e.shortcuts.first()) }) {
                EmoticonGlyph(e.id, 26.dp)
            }
        }
    }
}
