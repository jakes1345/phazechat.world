package world.phazechat.app

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import androidx.core.app.Person
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

class PhazeFCMService : FirebaseMessagingService() {

    companion object {
        private const val TAG = "PhazeFCM"
        const val CHANNEL_ID = "phaze_messages"
        const val ACTIVITY_CHANNEL_ID = "phaze_activity"

        /** Kinds the server sends; see nexus_server/push.go. */
        private val CHAT_KINDS = setOf("dm", "missed_call")
        private val SPACE_KINDS = setOf("channel", "mention")
        private val ACTIVITY_KINDS = setOf("missed_call", "friend_request")
    }

    override fun onCreate() {
        super.onCreate()
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_ID, "Messages", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "Phaze message notifications"
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 200, 100, 200)
            }
        )
        nm.createNotificationChannel(
            NotificationChannel(ACTIVITY_CHANNEL_ID, "Calls and requests", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "Missed calls and friend requests"
                enableVibration(true)
            }
        )
    }

    override fun onNewToken(token: String) {
        Log.d(TAG, "FCM token refreshed")
        getSharedPreferences("phaze_prefs", Context.MODE_PRIVATE)
            .edit().putString("fcm_token", token).apply()
    }

    override fun onMessageReceived(message: RemoteMessage) {
        // Android 13+ requires POST_NOTIFICATIONS permission at runtime
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) return
        }

        // Do Not Disturb drops the ping entirely; the message still syncs
        // over the socket next time the app opens.
        val prefs = getSharedPreferences("phaze_prefs", Context.MODE_PRIVATE)
        if (prefs.getString("my_status", "Online") == "Do Not Disturb") return

        val data = message.data
        val title = message.notification?.title ?: data["title"] ?: "Phaze"
        val body = message.notification?.body ?: data["body"] ?: ""
        val kind = data["kind"].orEmpty()
        val sender = data["sender"] ?: data["from"] ?: ""
        val serverId = data["server_id"].orEmpty()
        val channelId = data["channel_id"].orEmpty()
        val convoId = data["convo_id"].orEmpty()

        // What a tap opens: the person's chat, or the Space channel. Older
        // servers sent no kind, so a sender alone still opens their chat.
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            when {
                kind in SPACE_KINDS && serverId.isNotBlank() -> {
                    putExtra("open_space", serverId)
                    putExtra("open_channel", channelId)
                }
                (kind in CHAT_KINDS || kind.isEmpty()) && sender.isNotBlank() -> putExtra("open_chat", sender)
            }
        }
        // One notification per conversation, replaced as new messages arrive.
        val threadKey = when {
            kind in SPACE_KINDS && channelId.isNotBlank() -> "ch:$channelId"
            convoId.isNotBlank() -> "convo:$convoId"
            kind == "friend_request" -> "req:$sender"
            kind == "missed_call" -> "call:$sender"
            sender.isNotBlank() -> "dm:$sender"
            else -> message.messageId ?: System.currentTimeMillis().toString()
        }
        val pendingIntent = PendingIntent.getActivity(
            this, threadKey.hashCode(), intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val channel = if (kind in ACTIVITY_KINDS) ACTIVITY_CHANNEL_ID else CHANNEL_ID

        val builder = NotificationCompat.Builder(this, channel)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(
                when (kind) {
                    "missed_call" -> NotificationCompat.CATEGORY_MISSED_CALL
                    "friend_request" -> NotificationCompat.CATEGORY_SOCIAL
                    else -> NotificationCompat.CATEGORY_MESSAGE
                }
            )

        // Messaging style for direct messages, so Android groups them as a conversation.
        if ((kind == "dm" || kind.isEmpty()) && sender.isNotBlank()) {
            val person = Person.Builder().setName(sender).build()
            val style = NotificationCompat.MessagingStyle(person)
                .addMessage(body, System.currentTimeMillis(), person)
            builder.setStyle(style)
        }

        nm.notify(threadKey.hashCode(), builder.build())
    }
}
