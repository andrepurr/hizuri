package expo.modules.twowayaudio

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat

/**
 * Keeps voice mode alive while the app is minimised or the screen is off.
 *
 * Android 14 only lets a backgrounded app keep the microphone through a foreground service of
 * type `microphone`, started while the app is visible and after RECORD_AUDIO was granted. The
 * service owns no audio: AudioEngine keeps capturing and playing in the app process, and this
 * service only holds the process in the foreground state, shows the ongoing notification and
 * holds a partial wake lock so the CPU keeps feeding the WebSocket with the screen off.
 */
class VoiceForegroundService : Service() {
    companion object {
        private const val TAG = "VoiceForegroundService"
        private const val CHANNEL_ID = "zuri_voice"
        private const val NOTIFICATION_ID = 4711
        private const val ALERT_CHANNEL_ID = "zuri_voice_alerts"
        private const val ALERT_NOTIFICATION_ID = 4712
        private const val EXTRA_TITLE = "title"
        private const val EXTRA_TEXT = "text"

        /**
         * True from start() until stop() or a swipe from recents. Set by the callers, not by
         * onDestroy(): a stop followed by a quick start must not see the old instance's onDestroy
         * flip it back to false.
         */
        @Volatile
        var isRunning = false
            private set

        /** Returns false when Android refuses the start (for example, the app is not visible). */
        fun start(context: Context, title: String, text: String): Boolean {
            val intent = Intent(context, VoiceForegroundService::class.java)
                .putExtra(EXTRA_TITLE, title)
                .putExtra(EXTRA_TEXT, text)
            return try {
                ContextCompat.startForegroundService(context, intent)
                isRunning = true
                true
            } catch (e: IllegalStateException) {
                // ForegroundServiceStartNotAllowedException (API 31+) extends IllegalStateException.
                Log.w(TAG, "Foreground service start refused", e)
                false
            }
        }

        fun stop(context: Context) {
            isRunning = false
            context.stopService(Intent(context, VoiceForegroundService::class.java))
            clearAlert(context)
        }

        /**
         * "hizuri can't hear you": an alerting notification with sound, separate from the silent
         * ongoing one, so it reaches the user through headphones with the phone in a pocket.
         * Returns false when notifications are blocked.
         */
        fun showAlert(context: Context, title: String, text: String): Boolean {
            val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (!manager.areNotificationsEnabled()) {
                return false
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
                manager.getNotificationChannel(ALERT_CHANNEL_ID) == null
            ) {
                val channel = NotificationChannel(
                    ALERT_CHANNEL_ID,
                    "Voice alerts",
                    NotificationManager.IMPORTANCE_HIGH
                )
                channel.description = "Tells you when hizuri stops hearing you"
                manager.createNotificationChannel(channel)
            }
            val notification = NotificationCompat.Builder(context, ALERT_CHANNEL_ID)
                .setContentTitle(title)
                .setContentText(text)
                .setStyle(NotificationCompat.BigTextStyle().bigText(text))
                .setSmallIcon(android.R.drawable.stat_notify_error)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_STATUS)
                .setAutoCancel(true)
                .apply { launchIntent(context)?.let { setContentIntent(it) } }
                .build()
            manager.notify(ALERT_NOTIFICATION_ID, notification)
            return true
        }

        fun clearAlert(context: Context) {
            val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.cancel(ALERT_NOTIFICATION_ID)
        }

        private fun launchIntent(context: Context): PendingIntent? {
            val intent = context.packageManager.getLaunchIntentForPackage(context.packageName)
                ?: return null
            return PendingIntent.getActivity(
                context,
                0,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
        }
    }

    private var wakeLock: PowerManager.WakeLock? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val title = intent?.getStringExtra(EXTRA_TITLE) ?: "hizuri"
        val text = intent?.getStringExtra(EXTRA_TEXT) ?: "hizuri is listening"
        enterForeground(buildNotification(title, text))
        acquireWakeLock()
        // Voice mode is restarted by the user, never by the system after a kill.
        return START_NOT_STICKY
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        // Swiping hizuri away from recents ends voice mode; the microphone must not outlive the UI.
        isRunning = false
        stopSelf()
        super.onTaskRemoved(rootIntent)
    }

    override fun onDestroy() {
        releaseWakeLock()
        super.onDestroy()
    }

    private fun enterForeground(notification: Notification) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification)
            return
        }
        val playback = ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            startForeground(NOTIFICATION_ID, notification, playback)
            return
        }
        try {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE or playback
            )
        } catch (e: SecurityException) {
            // The microphone type needs RECORD_AUDIO and a visible app. Without it, keep at least
            // playback alive instead of crashing on the startForegroundService() contract.
            Log.w(TAG, "Microphone foreground type refused; falling back to playback only", e)
            startForeground(NOTIFICATION_ID, notification, playback)
        }
    }

    private fun buildNotification(title: String, text: String): Notification {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
            manager.getNotificationChannel(CHANNEL_ID) == null
        ) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Voice mode",
                NotificationManager.IMPORTANCE_LOW
            )
            channel.description = "Shown while hizuri listens in the background"
            channel.setShowBadge(false)
            manager.createNotificationChannel(channel)
        }

        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
        val contentIntent = launchIntent?.let {
            PendingIntent.getActivity(
                this,
                0,
                it,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
        }

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .apply { contentIntent?.let { setContentIntent(it) } }
            .build()
    }

    private fun acquireWakeLock() {
        if (wakeLock?.isHeld == true) return
        val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "zuri:voice").apply {
            setReferenceCounted(false)
            acquire()
        }
    }

    private fun releaseWakeLock() {
        wakeLock?.let { if (it.isHeld) it.release() }
        wakeLock = null
    }
}
