package world.phazechat.app.call

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioDeviceInfo
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Build
import android.os.PowerManager
import android.util.Log

/**
 * Where call audio plays while a call is up: the earpiece (or a headset) for
 * voice calls, the loudspeaker for video calls, switchable from the call
 * screen. Also holds audio focus, and for earpiece calls turns the screen off
 * when the phone is held to the ear.
 */
class CallAudio(context: Context) {
    private val am = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    private val power = context.getSystemService(Context.POWER_SERVICE) as PowerManager
    private var focus: AudioFocusRequest? = null
    private var proximity: PowerManager.WakeLock? = null
    private var previousMode = AudioManager.MODE_NORMAL
    private var started = false

    var speakerOn = false
        private set

    fun start(speaker: Boolean) {
        if (started) return
        started = true
        previousMode = am.mode
        val req = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build()
            )
            .setOnAudioFocusChangeListener { }
            .build()
        am.requestAudioFocus(req)
        focus = req
        am.mode = AudioManager.MODE_IN_COMMUNICATION
        setSpeaker(speaker)
    }

    fun setSpeaker(on: Boolean) {
        speakerOn = on
        if (!started) return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val devices = am.availableCommunicationDevices
            val target = if (on) {
                devices.firstOrNull { it.type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER }
            } else {
                // A connected headset wins over the earpiece.
                HEADSET_TYPES.firstNotNullOfOrNull { t -> devices.firstOrNull { it.type == t } }
                    ?: devices.firstOrNull { it.type == AudioDeviceInfo.TYPE_BUILTIN_EARPIECE }
            }
            if (target != null) am.setCommunicationDevice(target) else am.clearCommunicationDevice()
        } else {
            @Suppress("DEPRECATION")
            am.isSpeakerphoneOn = on
        }
        updateProximity()
    }

    fun stop() {
        if (!started) return
        started = false
        releaseProximity()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            am.clearCommunicationDevice()
        } else {
            @Suppress("DEPRECATION")
            am.isSpeakerphoneOn = false
        }
        am.mode = previousMode
        focus?.let { am.abandonAudioFocusRequest(it) }
        focus = null
    }

    private fun updateProximity() {
        if (speakerOn) {
            releaseProximity()
            return
        }
        if (proximity == null && power.isWakeLockLevelSupported(PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK)) {
            proximity = power.newWakeLock(PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK, "phaze:call").apply {
                setReferenceCounted(false)
                try { acquire(MAX_CALL_MS) } catch (e: Exception) { Log.w("CallAudio", "proximity", e) }
            }
        }
    }

    private fun releaseProximity() {
        proximity?.let { if (it.isHeld) it.release() }
        proximity = null
    }

    private companion object {
        val HEADSET_TYPES = listOf(
            AudioDeviceInfo.TYPE_BLUETOOTH_SCO,
            AudioDeviceInfo.TYPE_BLE_HEADSET,
            AudioDeviceInfo.TYPE_WIRED_HEADSET,
            AudioDeviceInfo.TYPE_USB_HEADSET,
        )
        const val MAX_CALL_MS = 4 * 60 * 60 * 1000L
    }
}
