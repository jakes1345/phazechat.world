package world.phazechat.app.data

import java.net.URI

const val PHAZE_ORIGIN = "https://phazechat.world"

/**
 * Turns an attachment URL from a message into something safe to open.
 *
 * Uploads come back from the server as site-relative paths ("/uploads/…"),
 * which have no scheme for Android to resolve, so they're resolved against
 * the Phaze origin. Only http(s) is allowed: a message body is attacker
 * controlled, and intent:, file:, content: or javascript: links must never
 * be handed to the system. Returns null when the URL can't be opened.
 */
fun resolveAttachmentUrl(raw: String?): String? {
    val s = raw?.trim().orEmpty()
    if (s.isEmpty()) return null
    return try {
        val resolved = URI(PHAZE_ORIGIN + "/").resolve(URI(s))
        val scheme = resolved.scheme?.lowercase()
        if ((scheme == "https" || scheme == "http") && !resolved.host.isNullOrEmpty()) resolved.toString() else null
    } catch (_: Exception) {
        null
    }
}
