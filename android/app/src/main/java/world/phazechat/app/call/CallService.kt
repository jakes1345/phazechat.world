package world.phazechat.app.call

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import world.phazechat.app.MainActivity
import world.phazechat.app.R

/**
 * Keeps a call going while Phaze is in the background: Android only lets an
 * app use the microphone and camera from the background while it shows an
 * ongoing notification. The notification opens the call and can hang up.
 */
class CallService : Service() {

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_HANG_UP) {
            onHangUp?.invoke()
            stopSelf()
            return START_NOT_STICKY
        }
        val peer = intent?.getStringExtra(EXTRA_PEER).orEmpty()
        val video = intent?.getBooleanExtra(EXTRA_VIDEO, false) ?: false
        ensureChannel()

        val open = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val hangUp = PendingIntent.getService(
            this, 1,
            Intent(this, CallService::class.java).setAction(ACTION_HANG_UP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(if (peer.isNotEmpty()) "Call with $peer" else "Phaze call")
            .setContentText(if (video) "Video call" else "Voice call")
            .setOngoing(true)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setContentIntent(open)
            .addAction(0, "Hang up", hangUp)
            .build()

        // Service types exist from Android 11; before that a plain foreground
        // service may use the microphone and camera.
        var types = 0
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            types = ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
            if (video) types = types or ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA
        }
        try {
            ServiceCompat.startForeground(this, NOTIFICATION_ID, notification, types)
        } catch (e: Exception) {
            // Started from the background or a permission was taken away: the
            // call still works while Phaze is on screen.
            Log.w(TAG, "couldn't keep the call running in the background", e)
            stopSelf()
        }
        return START_NOT_STICKY
    }

    private fun ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = getSystemService(NotificationManager::class.java)
        if (nm.getNotificationChannel(CHANNEL_ID) == null) {
            nm.createNotificationChannel(
                NotificationChannel(CHANNEL_ID, "Ongoing calls", NotificationManager.IMPORTANCE_LOW).apply {
                    description = "Shown while you're on a Phaze call"
                    setShowBadge(false)
                }
            )
        }
    }

    companion object {
        private const val TAG = "CallService"
        private const val CHANNEL_ID = "phaze_calls"
        private const val NOTIFICATION_ID = 4210
        private const val ACTION_HANG_UP = "world.phazechat.app.call.HANG_UP"
        private const val EXTRA_PEER = "peer"
        private const val EXTRA_VIDEO = "video"

        /** Set by the app while a call is up; the notification's Hang up calls it. */
        @Volatile var onHangUp: (() -> Unit)? = null

        /** Call while the app is on screen (Android blocks starting it from the background). */
        fun start(context: Context, peer: String, video: Boolean) {
            val intent = Intent(context, CallService::class.java)
                .putExtra(EXTRA_PEER, peer)
                .putExtra(EXTRA_VIDEO, video)
            try {
                ContextCompat.startForegroundService(context, intent)
            } catch (e: Exception) {
                Log.w(TAG, "couldn't start call service", e)
            }
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, CallService::class.java))
        }
    }
}
