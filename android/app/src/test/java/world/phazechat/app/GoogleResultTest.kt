package world.phazechat.app

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import world.phazechat.app.data.GoogleResult
import world.phazechat.app.data.GoogleStep

class GoogleResultTest {
    private fun parse(s: String) = GoogleResult.parse(JSONObject(s))

    @Test fun signedInNeedsTokenAndUsername() {
        assertEquals(GoogleResult.SignedIn("alex", "tok"), parse("""{"status":"ok","username":"alex","token":"tok"}"""))
        // The web flow's ok has no token in the body; the app can't use that.
        assertTrue(parse("""{"status":"ok","username":"alex"}""") is GoogleResult.Failed)
    }

    @Test fun newAccountAsksForUsername() {
        assertEquals(
            GoogleResult.Next(GoogleStep.ChooseUsername("t1", "a@b.com", "alex_b")),
            parse("""{"status":"username_required","ticket":"t1","email":"a@b.com","suggestion":"alex_b"}"""),
        )
    }

    @Test fun existingAccountAsksForItsPassword() {
        assertEquals(
            GoogleResult.Next(GoogleStep.Link("t2", "a@b.com", "alex")),
            parse("""{"status":"link_required","ticket":"t2","email":"a@b.com","username":"alex"}"""),
        )
    }

    @Test fun totpWithTicketIsItsOwnStep() {
        assertEquals(GoogleResult.Next(GoogleStep.Totp("t3")), parse("""{"status":"totp_required","ticket":"t3"}"""))
        // Without a ticket it's the link step asking for the code as well.
        assertEquals(GoogleResult.TotpNeeded("2FA code required or invalid"),
            parse("""{"status":"totp_required","error":"2FA code required or invalid"}"""))
    }

    @Test fun errorsKeepTheServersMessage() {
        assertEquals(GoogleResult.Failed("This account is banned."), parse("""{"status":"error","error":"This account is banned."}"""))
        assertTrue(GoogleResult.parse(null) is GoogleResult.Failed)
        assertTrue(parse("""{"status":"username_required"}""") is GoogleResult.Failed)
    }
}
