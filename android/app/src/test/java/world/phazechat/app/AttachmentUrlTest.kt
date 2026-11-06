package world.phazechat.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import world.phazechat.app.data.resolveAttachmentUrl

class AttachmentUrlTest {
    @Test fun relativeUploadResolvesAgainstPhaze() {
        assertEquals("https://phazechat.world/uploads/abc.png", resolveAttachmentUrl("/uploads/abc.png"))
        assertEquals("https://phazechat.world/uploads/abc.png", resolveAttachmentUrl("uploads/abc.png"))
    }

    @Test fun absoluteHttpUrlsPassThrough() {
        assertEquals("https://cdn.example.com/f.pdf", resolveAttachmentUrl("https://cdn.example.com/f.pdf"))
        assertEquals("http://example.com/f", resolveAttachmentUrl("http://example.com/f"))
    }

    @Test fun otherSchemesAreRefused() {
        assertNull(resolveAttachmentUrl("javascript:alert(1)"))
        assertNull(resolveAttachmentUrl("intent://scan/#Intent;scheme=zxing;end"))
        assertNull(resolveAttachmentUrl("file:///data/data/world.phazechat.app/shared_prefs/phaze_prefs.xml"))
        assertNull(resolveAttachmentUrl("content://com.android.contacts/contacts"))
        assertNull(resolveAttachmentUrl("tel:123"))
    }

    @Test fun blankOrMalformedIsRefused() {
        assertNull(resolveAttachmentUrl(null))
        assertNull(resolveAttachmentUrl(""))
        assertNull(resolveAttachmentUrl("   "))
        assertNull(resolveAttachmentUrl("http://[bad"))
    }
}
