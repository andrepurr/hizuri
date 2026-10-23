package com.hizuri.floating

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.jstasks.HeadlessJsTaskConfig
import com.facebook.react.jstasks.HeadlessJsTaskContext
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Floating assistant over other apps (FloatService). JS (packages/app/src/float/) decides when it
// is shown: the service runs while floating is on, and its window exists only while hizuri itself
// is not on screen.
class HizuriFloatModule : Module() {
  companion object {
    // Registered in JS with AppRegistry.registerHeadlessTask (packages/app/src/float/).
    private const val KEEP_ALIVE_TASK = "HizuriFloatKeepAlive"
    private var keepAliveTaskId: Int? = null
  }

  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("HizuriFloat")

    Events(FloatBus.EVENT)

    OnCreate {
      FloatBus.emit = { body -> sendEvent(FloatBus.EVENT, body) }
    }

    OnDestroy {
      FloatBus.emit = null
    }

    Function("canDrawOverlays") { Settings.canDrawOverlays(context) }

    // The "Display over other apps" page for hizuri. On Android 15 a sideloaded app's switch
    // stays grey there until App info → ⋮ → Allow restricted settings.
    Function("openOverlaySettings") {
      val intent = Intent(
        Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
        Uri.parse("package:${context.packageName}"),
      ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      try {
        context.startActivity(intent)
        true
      } catch (e: Exception) {
        Log.w("HizuriFloat", "No overlay settings page", e)
        false
      }
    }

    // Starts the service while the app is on screen. `foreground`: no voice session keeps the
    // process alive, so the service holds its own notification.
    Function("start") { widthDp: Double, heightDp: Double, foreground: Boolean, title: String, text: String ->
      if (!Settings.canDrawOverlays(context)) return@Function false
      FloatService.start(context, widthDp, heightDp, foreground, title, text)
    }

    Function("stop") {
      finishKeepAliveTask()
      context.stopService(Intent(context, FloatService::class.java))
      Unit
    }

    Function("isRunning") { FloatService.instance != null }

    Function("isShown") { FloatService.instance?.isShown == true }

    Function("show") { widthDp: Double, heightDp: Double ->
      val service = FloatService.instance ?: return@Function false
      // JS timers pause with the activity unless a headless task runs; the assistant's walks run on
      // them.
      startKeepAliveTask()
      service.show(widthDp, heightDp)
      true
    }

    Function("hide") {
      finishKeepAliveTask()
      FloatService.instance?.hide()
      Unit
    }

    Function("setForeground") { on: Boolean ->
      FloatService.instance?.setForeground(on)
      Unit
    }

    Function("walk") { direction: Int, distanceDp: Double, speedDp: Double ->
      FloatService.instance?.walk(direction, distanceDp, speedDp)
      Unit
    }

    Function("stopWalk") {
      FloatService.instance?.stopWalk()
      Unit
    }

    Function("requestPosition") {
      FloatService.instance?.emitPosition()
      Unit
    }

    Function("openApp") { FloatService.instance?.openApp() == true }
  }

  private fun startKeepAliveTask() {
    val reactContext = appContext.reactContext as? ReactContext ?: return
    UiThreadUtil.runOnUiThread {
      if (keepAliveTaskId != null) return@runOnUiThread
      try {
        keepAliveTaskId = HeadlessJsTaskContext.getInstance(reactContext).startTask(
          HeadlessJsTaskConfig(KEEP_ALIVE_TASK, Arguments.createMap(), 0L, true),
        )
      } catch (e: Exception) {
        Log.w("HizuriFloat", "Could not start the float keep-alive task", e)
      }
    }
  }

  private fun finishKeepAliveTask() {
    val reactContext = appContext.reactContext as? ReactContext ?: return
    UiThreadUtil.runOnUiThread {
      val taskId = keepAliveTaskId ?: return@runOnUiThread
      keepAliveTaskId = null
      HeadlessJsTaskContext.getInstance(reactContext).finishTask(taskId)
    }
  }
}
