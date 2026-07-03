package world.phazechat.app

import org.junit.Assert.assertEquals
import org.junit.Test
import world.phazechat.app.ui.EmoToken
import world.phazechat.app.ui.tokenize

class EmoticonsTest {
    private fun flat(s: String) = tokenize(s).joinToString("") {
        when (it) { is EmoToken.Text -> it.value; is EmoToken.Emo -> "[${it.id}]" }
    }

    @Test fun wordShortcuts() = assertEquals("hi [wave] there", flat("hi (wave) there"))
    @Test fun symbolShortcuts() = assertEquals("ok [smile] bye [sad]", flat("ok :) bye :-("))
    @Test fun unknownParens() = assertEquals("call me (maybe)", flat("call me (maybe)"))
    @Test fun urlsUntouched() = assertEquals("see https://a.io/x:(y) ok", flat("see https://a.io/x:(y) ok"))
    @Test fun emoticonOnly() = assertEquals("[heart]", flat("(heart)"))
    @Test fun longestMatch() = assertEquals("[smile]", flat(":-)"))
}
