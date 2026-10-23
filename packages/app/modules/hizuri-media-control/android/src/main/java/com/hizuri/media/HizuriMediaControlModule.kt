package com.hizuri.media

import android.app.NotificationManager
import android.app.SearchManager
import android.content.ActivityNotFoundException
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.media.MediaMetadata
import android.media.session.MediaController
import android.media.session.MediaSessionManager
import android.media.session.PlaybackState
import android.net.Uri
import android.os.Build
import android.os.SystemClock
import android.provider.MediaStore
import android.provider.Settings
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlin.math.roundToInt

// Show window, lane 3: open the user's own media apps and steer what they play through Android
// MediaSession, the channel the lock screen and headphone buttons use. Steering needs the
// Notification access switch for hizuri (one time, in Android settings).
class HizuriMediaControlModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("HizuriMediaControl")

    // ACTION_VIEW aimed at one app; without it (not installed) any handler takes the link.
    Function("openInApp") { url: String, packageName: String? ->
      val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
      if (packageName != null && start(Intent(intent).setPackage(packageName))) {
        return@Function true
      }
      start(intent)
    }

    // Starts playback of the best match in a music app, the way voice assistants do.
    Function("playFromSearch") { packageName: String, query: String ->
      val intent = Intent(MediaStore.INTENT_ACTION_MEDIA_PLAY_FROM_SEARCH)
        .setPackage(packageName)
        .putExtra(SearchManager.QUERY, query)
        .putExtra(MediaStore.EXTRA_MEDIA_FOCUS, "vnd.android.cursor.item/*")
      start(intent)
    }

    Function("hasNotificationAccess") {
      val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      manager.isNotificationListenerAccessGranted(listenerComponent())
    }

    Function("openNotificationAccessSettings") {
      val intent =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
          Intent(Settings.ACTION_NOTIFICATION_LISTENER_DETAIL_SETTINGS).putExtra(
            Settings.EXTRA_NOTIFICATION_LISTENER_COMPONENT_NAME,
            listenerComponent().flattenToString(),
          )
        } else {
          Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
        }
      start(intent) || start(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
    }

    Function("listSessions") {
      otherSessions().map { controller ->
        val metadata = controller.metadata
        mapOf(
          "packageName" to controller.packageName,
          "state" to stateName(controller.playbackState?.state),
          "title" to metadata?.getString(MediaMetadata.METADATA_KEY_TITLE),
          "artist" to metadata?.getString(MediaMetadata.METADATA_KEY_ARTIST),
        )
      }
    }

    // value: seconds for seekTo/seekBy, percent for volume.
    Function("control") { packageName: String?, action: String, value: Double? ->
      val controller = pickSession(packageName) ?: return@Function false
      val controls = controller.transportControls
      when (action) {
        "play" -> controls.play()
        "pause" -> controls.pause()
        "stop" -> controls.stop()
        "next" -> controls.skipToNext()
        "previous" -> controls.skipToPrevious()
        "seekTo" -> controls.seekTo(((value ?: 0.0) * 1000).toLong().coerceAtLeast(0))
        "seekBy" -> {
          val target = currentPositionMs(controller) + ((value ?: 0.0) * 1000).toLong()
          controls.seekTo(target.coerceAtLeast(0))
        }
        "volume" -> {
          val info = controller.playbackInfo
          controller.setVolumeTo(((value ?: 0.0) / 100.0 * info.maxVolume).roundToInt(), 0)
        }
        else -> return@Function false
      }
      true
    }
  }

  private fun start(intent: Intent): Boolean {
    val activity = appContext.currentActivity
    return try {
      if (activity != null) {
        activity.startActivity(intent)
      } else {
        context.startActivity(Intent(intent).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      }
      true
    } catch (_: ActivityNotFoundException) {
      false
    } catch (_: SecurityException) {
      false
    }
  }

  private fun listenerComponent() = ComponentName(context, HizuriMediaListener::class.java)

  /** Active sessions of other apps, newest first; empty without Notification access. */
  private fun otherSessions(): List<MediaController> {
    val manager = context.getSystemService(Context.MEDIA_SESSION_SERVICE) as MediaSessionManager
    return try {
      manager.getActiveSessions(listenerComponent()).filter { it.packageName != context.packageName }
    } catch (_: SecurityException) {
      emptyList()
    }
  }

  private fun pickSession(packageName: String?): MediaController? {
    val sessions = otherSessions()
    if (packageName != null) {
      sessions.firstOrNull { it.packageName == packageName }?.let { return it }
    }
    return sessions.firstOrNull { it.playbackState?.state == PlaybackState.STATE_PLAYING }
      ?: sessions.firstOrNull()
  }

  private fun currentPositionMs(controller: MediaController): Long {
    val state = controller.playbackState ?: return 0
    if (state.state != PlaybackState.STATE_PLAYING) return state.position
    val elapsed = SystemClock.elapsedRealtime() - state.lastPositionUpdateTime
    return state.position + (elapsed * state.playbackSpeed).toLong()
  }

  private fun stateName(state: Int?): String =
    when (state) {
      PlaybackState.STATE_PLAYING -> "playing"
      PlaybackState.STATE_PAUSED -> "paused"
      PlaybackState.STATE_BUFFERING -> "buffering"
      PlaybackState.STATE_STOPPED -> "stopped"
      PlaybackState.STATE_ERROR -> "error"
      else -> "none"
    }
}
