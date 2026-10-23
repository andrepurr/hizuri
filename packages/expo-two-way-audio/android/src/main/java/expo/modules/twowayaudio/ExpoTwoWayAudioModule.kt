package expo.modules.twowayaudio

import AudioEngine
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.util.Log
import androidx.core.os.bundleOf
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.jstasks.HeadlessJsTaskConfig
import com.facebook.react.jstasks.HeadlessJsTaskContext
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise
import expo.modules.interfaces.permissions.Permissions

class ExpoTwoWayAudioModule : Module() {
    companion object {
        private const val ON_MIC_DATA_EVENT = "onMicrophoneData"
        private const val ON_INPUT_VOLUME_LEVEL_EVENT = "onInputVolumeLevelData"
        private const val ON_OUTPUT_VOLUME_LEVEL_EVENT = "onOutputVolumeLevelData"
        private const val ON_RECORDING_CHANGE_EVENT = "onRecordingChange"
        private const val ON_AUDIO_INTERRUPTION_EVENT = "onAudioInterruption"
        private const val ON_AUDIO_ROUTE_EVENT = "onAudioRoute"
        // Registered in JS with AppRegistry.registerHeadlessTask (packages/app voice service).
        private const val KEEP_ALIVE_TASK = "ZuriVoiceKeepAlive"
        var audioEngine: AudioEngine? = null
        private var keepAliveTaskId: Int? = null
    }

    override fun definition() = ModuleDefinition {
        Name("ExpoTwoWayAudio")

        // Voice mode in the background: foreground service + a headless JS task. React Native
        // pauses JS timers when the activity pauses unless a headless task is active, and the
        // voice playback queue and reconnects run on timers.
        AsyncFunction("startVoiceForegroundService") { title: String, text: String ->
            val context = appContext.reactContext ?: return@AsyncFunction false
            if (!VoiceForegroundService.start(context, title, text)) {
                return@AsyncFunction false
            }
            startKeepAliveTask()
            true
        }

        Function("stopVoiceForegroundService") {
            appContext.reactContext?.let { VoiceForegroundService.stop(it) }
            finishKeepAliveTask()
            null
        }

        Function("isVoiceForegroundServiceRunning") {
            VoiceForegroundService.isRunning
        }

        // A plain notification, so it can be posted from the background (no service start).
        Function("showVoiceAlert") { title: String, text: String ->
            val context = appContext.reactContext ?: return@Function false
            VoiceForegroundService.showAlert(context, title, text)
        }

        Function("clearVoiceAlert") {
            appContext.reactContext?.let { VoiceForegroundService.clearAlert(it) }
            null
        }

        AsyncFunction("requestNotificationPermissionAsync") { promise: Promise ->
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
                promise.resolve(mapOf("granted" to true, "canAskAgain" to false, "status" to "granted", "expires" to "never"))
                return@AsyncFunction
            }
            Permissions.askForPermissionsWithPermissionsManager(
                appContext.permissions,
                promise,
                android.Manifest.permission.POST_NOTIFICATIONS
            )
        }

        // Doze and app standby cut the network of a backgrounded app, foreground service or not.
        Function("isIgnoringBatteryOptimizations") {
            val context = appContext.reactContext ?: return@Function true
            val powerManager = context.getSystemService(Context.POWER_SERVICE) as PowerManager
            powerManager.isIgnoringBatteryOptimizations(context.packageName)
        }

        /** Opens the system "let this app run in the background" dialog. False if it cannot open. */
        Function("requestIgnoreBatteryOptimizations") {
            val context: Context = appContext.currentActivity
                ?: appContext.reactContext
                ?: return@Function false
            val intent = Intent(
                Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                Uri.parse("package:${context.packageName}")
            )
            if (context !is Activity) {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            try {
                context.startActivity(intent)
                true
            } catch (e: ActivityNotFoundException) {
                Log.w("ExpoTwoWayAudio", "No battery optimisation dialog on this device", e)
                false
            }
        }

        OnDestroy {
            appContext.reactContext?.let { VoiceForegroundService.stop(it) }
            finishKeepAliveTask()
        }
        AsyncFunction("initialize") { promise: Promise ->
            try {
                if (audioEngine != null) {
                    promise.resolve(true)
                    return@AsyncFunction
                }
                audioEngine = appContext.reactContext?.let { AudioEngine(it) }
                setupCallbacks()
                // The engine picks its first route in its constructor, before the callback exists.
                audioEngine?.routeDescription?.let {
                    sendEvent(ON_AUDIO_ROUTE_EVENT, bundleOf("data" to it))
                }
                promise.resolve(true)
            } catch (e: Exception) {
                promise.resolve(false)
            }
        }

         Function("releaseAudioSession") {
             audioEngine?.releaseAudioSession()
             null
         }

         Function("isRecording") {
             audioEngine?.isRecording ?: false
         }

         Function("startDictation") {
             val isRecording = audioEngine?.startDictation() ?: false
             sendEvent(ON_RECORDING_CHANGE_EVENT, mapOf("data" to isRecording))
             isRecording
         }

         Function("toggleRecording") { value: Boolean ->
             audioEngine?.let { engine ->
                 val isRecording = engine.toggleRecording(value)
                 sendEvent(ON_RECORDING_CHANGE_EVENT, mapOf("data" to isRecording))
                 isRecording
             } ?: false
         }

         Function("tearDown") {
             audioEngine?.tearDown()
             audioEngine = null
             null
         }

         Function("restart") {
             audioEngine?.resumeRecordingAndPlayer()
             sendEvent(ON_RECORDING_CHANGE_EVENT, mapOf(
                 "data" to (audioEngine?.isRecording ?: false)
             ))
         }

         Function("playPCMData") { data: kotlin.ByteArray ->
             audioEngine?.playPCMData(data)
         }

         Function("getOutputTiming") {
             audioEngine?.outputTiming()
         }

         Function("bypassVoiceProcessing") { bypass: Boolean ->
             audioEngine?.bypassVoiceProcessing(bypass)
         }

         Function("isPlaying") {
             audioEngine?.isPlaying ?: false
         }

         Function("stopPlayback") {
             audioEngine?.stopPlayback()
         }

         Function("pausePlayback") {
             audioEngine?.pausePlayback()
         }

         Function("resumePlayback") {
             audioEngine?.resumePlayback()
         }

        Function("getMicrophoneModeIOS") {
            throw UnsupportedOperationException("getMicrophoneModeIOS is only supported on iOS")
        }

        Function ("setMicrophoneModeIOS") {
            throw UnsupportedOperationException("setMicrophoneModeIOS is only supported on iOS")
        }

         AsyncFunction("getMicrophonePermissionsAsync") { promise: Promise ->
             Permissions.getPermissionsWithPermissionsManager(
                 appContext.permissions,
                 promise,
                 android.Manifest.permission.RECORD_AUDIO
             )
         }

         AsyncFunction("requestMicrophonePermissionsAsync") { promise: Promise ->
             Permissions.askForPermissionsWithPermissionsManager(
                 appContext.permissions,
                 promise,
                 android.Manifest.permission.RECORD_AUDIO
             )
         }

        // Register events
        Events(
            ON_MIC_DATA_EVENT,
            ON_INPUT_VOLUME_LEVEL_EVENT,
            ON_OUTPUT_VOLUME_LEVEL_EVENT,
            ON_RECORDING_CHANGE_EVENT,
            ON_AUDIO_INTERRUPTION_EVENT,
            ON_AUDIO_ROUTE_EVENT
        )
    }

    private fun startKeepAliveTask() {
        val reactContext = appContext.reactContext as? ReactContext ?: return
        UiThreadUtil.runOnUiThread {
            if (keepAliveTaskId != null) return@runOnUiThread
            try {
                keepAliveTaskId = HeadlessJsTaskContext.getInstance(reactContext).startTask(
                    HeadlessJsTaskConfig(KEEP_ALIVE_TASK, Arguments.createMap(), 0L, true)
                )
            } catch (e: Exception) {
                Log.w("ExpoTwoWayAudio", "Could not start the voice keep-alive task", e)
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

    private fun setupCallbacks() {
        audioEngine?.apply {
            onMicDataCallback = { data ->
                sendEvent(ON_MIC_DATA_EVENT, bundleOf("data" to data))
            }
            onInputVolumeCallback = { level ->
                sendEvent(ON_INPUT_VOLUME_LEVEL_EVENT, bundleOf("data" to level))
            }
            onOutputVolumeCallback = { level ->
                sendEvent(ON_OUTPUT_VOLUME_LEVEL_EVENT, bundleOf("data" to level))
            }
            onRouteChangeCallback = { description ->
                sendEvent(ON_AUDIO_ROUTE_EVENT, bundleOf("data" to description))
            }
            onAudioInterruptionCallback = { data ->
                sendEvent(ON_AUDIO_INTERRUPTION_EVENT, bundleOf("data" to data))
                sendEvent(ON_RECORDING_CHANGE_EVENT, bundleOf(
                    "data" to (audioEngine?.isRecording ?: false)
                ))
            }
        }
    }
}