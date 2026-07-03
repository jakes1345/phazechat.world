package world.phazechat.app.ui

sealed class EmoToken {
    data class Text(val value: String) : EmoToken()
    data class Emo(val id: String, val shortcut: String) : EmoToken()
}

data class Emoticon(val id: String, val shortcuts: List<String>, val emoji: String, val label: String)

// Mirrors web/src/emoticons.ts — same ids, same shortcuts, same fallbacks.
val EMOTICONS = listOf(
    Emoticon("smile", listOf("(smile)", ":-)", ":)"), "🙂", "Smile"),
    Emoticon("laugh", listOf("(laugh)", ":-D", ":D"), "😄", "Laugh"),
    Emoticon("wink", listOf("(wink)", ";-)", ";)"), "😉", "Wink"),
    Emoticon("sad", listOf("(sad)", ":-(", ":("), "🙁", "Sad"),
    Emoticon("cry", listOf("(cry)", ";'("), "😢", "Crying"),
    Emoticon("wave", listOf("(wave)", "(bye)"), "👋", "Wave"),
    Emoticon("heart", listOf("(heart)", "<3"), "❤️", "Heart"),
    Emoticon("kiss", listOf("(kiss)", ":-*", ":*"), "😘", "Kiss"),
    Emoticon("cool", listOf("(cool)", "8-)"), "😎", "Cool"),
    Emoticon("angry", listOf("(angry)", ":@"), "😠", "Angry"),
    Emoticon("surprised", listOf("(surprised)", ":-O", ":O"), "😮", "Surprised"),
    Emoticon("blush", listOf("(blush)", ":$"), "😊", "Blushing"),
    Emoticon("tongue", listOf("(tongue)", ":-P", ":P"), "😛", "Tongue out"),
    Emoticon("sweat", listOf("(sweat)", "(whew)"), "😅", "Sweating"),
    Emoticon("party", listOf("(party)"), "🥳", "Party"),
    Emoticon("sleepy", listOf("(sleepy)", "|-)"), "😪", "Sleepy"),
    Emoticon("think", listOf("(think)", ":-?"), "🤔", "Thinking"),
    Emoticon("yes", listOf("(yes)", "(y)"), "👍", "Thumbs up"),
    Emoticon("no", listOf("(no)", "(n)"), "👎", "Thumbs down"),
    Emoticon("hug", listOf("(hug)"), "🤗", "Hug"),
)

private val byShortcut: Map<String, String> =
    EMOTICONS.flatMap { e -> e.shortcuts.map { it to e.id } }.toMap()

// Longest first so ":-)" wins over ":)" at the same position.
private val allShortcuts = byShortcut.keys.sortedByDescending { it.length }
private val urlRe = Regex("""https?://\S+""")

fun tokenize(input: String): List<EmoToken> {
    val out = mutableListOf<EmoToken>()
    val text = StringBuilder()
    var i = 0
    fun flush() {
        if (text.isNotEmpty()) { out.add(EmoToken.Text(text.toString())); text.clear() }
    }
    outer@ while (i < input.length) {
        val url = urlRe.matchAt(input, i)
        if (url != null) { text.append(url.value); i += url.value.length; continue }
        for (s in allShortcuts) {
            if (input.startsWith(s, i)) {
                flush()
                out.add(EmoToken.Emo(byShortcut.getValue(s), s))
                i += s.length
                continue@outer
            }
        }
        text.append(input[i]); i++
    }
    flush()
    return out
}
