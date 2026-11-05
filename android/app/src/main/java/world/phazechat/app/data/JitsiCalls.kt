package world.phazechat.app.data

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import androidx.localbroadcastmanager.content.LocalBroadcastManager
import org.jitsi.meet.sdk.BroadcastEvent
import org.jitsi.meet.sdk.BroadcastIntentHelper
import org.jitsi.meet.sdk.JitsiMeetActivity
import org.jitsi.meet.sdk.JitsiMeetConferenceOptions
import org.jitsi.meet.sdk.JitsiMeetUserInfo
import java.net.URL

/**
 * Calls run in a Jitsi Meet room on meet.jit.si, like the web client
 * (web/src/App.tsx, `call_jitsi`). The server picks the room when the call is
 * answered; this wraps the Jitsi Meet SDK so the rest of the app only deals in
 * "join this room", "hang up" and "the conference ended".
 */
object JitsiCalls {
    const val SERVER_URL = "https://meet.jit.si"

    /**
     * Feature flags (names as defined by the 13.3.0 SDK,
     * react/features/base/flags/constants.ts) for things a 1:1 call started
     * from inside Phaze has no use for.
     */
    private val disabledFeatures = listOf(
        "welcomepage.enabled",
        "prejoinpage.enabled",        // the call was already accepted in Phaze
        "add-people.enabled",
        "invite.enabled",
        "invite-dial-in.enabled",
        "calendar.enabled",
        "recording.enabled",
        "ios.recording.enabled",
        "live-streaming.enabled",
        "meeting-password.enabled",
        "lobby-mode.enabled",
        "security-options.enabled",
        "breakout-rooms.enabled",
        "server-url-change.enabled",
        "help.enabled",
    )

    fun options(room: String, displayName: String?, video: Boolean): JitsiMeetConferenceOptions {
        val builder = JitsiMeetConferenceOptions.Builder()
            .setServerURL(URL(SERVER_URL))
            .setRoom(room)
            .setAudioMuted(false)
            .setVideoMuted(!video)
            // "Low bandwidth mode" is the SDK's audio-only mode (it was
            // renamed from audio-only): no video sent or received.
            .setLowBandwidthMode(!video)
        if (!displayName.isNullOrBlank()) {
            builder.setUserInfo(JitsiMeetUserInfo().apply { this.displayName = displayName })
        }
        disabledFeatures.forEach { builder.setFeatureFlag(it, false) }
        return builder.build()
    }

    /** Opens the SDK's conference activity and joins [room]. */
    fun launch(context: Context, room: String, displayName: String?, video: Boolean) {
        JitsiMeetActivity.launch(context, options(room, displayName, video))
    }

    /**
     * Brings a running conference back to the front. JitsiMeetActivity is
     * singleTask, and an intent without conference options doesn't rejoin.
     */
    fun bringToFront(context: Context) {
        val intent = Intent(context, JitsiMeetActivity::class.java)
        if (context !is android.app.Activity) intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
    }

    /** Asks an open conference to hang up; it then closes its activity. */
    fun hangUp(context: Context) {
        LocalBroadcastManager.getInstance(context).sendBroadcast(BroadcastIntentHelper.buildHangUpIntent())
    }

    /**
     * Calls [onEnded] with the conference URL (if the SDK sent one) whenever a
     * conference terminates or the SDK is ready to close. Returns the receiver
     * so the caller can pass it to [unregister].
     */
    fun registerEndListener(context: Context, onEnded: (url: String?) -> Unit): BroadcastReceiver {
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(ctx: Context?, intent: Intent?) {
                intent ?: return
                val event = BroadcastEvent(intent)
                when (event.type) {
                    BroadcastEvent.Type.CONFERENCE_TERMINATED,
                    BroadcastEvent.Type.READY_TO_CLOSE -> onEnded(event.data?.get("url") as? String)
                    else -> {}
                }
            }
        }
        val filter = IntentFilter().apply {
            addAction(BroadcastEvent.Type.CONFERENCE_TERMINATED.action)
            addAction(BroadcastEvent.Type.READY_TO_CLOSE.action)
        }
        LocalBroadcastManager.getInstance(context).registerReceiver(receiver, filter)
        return receiver
    }

    fun unregister(context: Context, receiver: BroadcastReceiver) {
        LocalBroadcastManager.getInstance(context).unregisterReceiver(receiver)
    }
}

/**
 * Whether an incoming `call_offer` is a video call. Current clients put the
 * kind ("audio"/"video") in `body`; older ones sent an SDP offer, where a
 * video m-line means video.
 */
fun isVideoOffer(body: String?, sdp: String?): Boolean = when (body) {
    "video" -> true
    "audio" -> false
    else -> sdp?.contains("m=video") == true || body?.contains("m=video") == true
}

/** Whether a conference-ended event (with the SDK's [url], if any) is for [room]. */
fun conferenceUrlMatchesRoom(url: String?, room: String?): Boolean {
    if (room.isNullOrBlank() || url.isNullOrBlank()) return true
    return url.substringBefore('#').substringBefore('?').trimEnd('/').endsWith("/$room", ignoreCase = true)
}
