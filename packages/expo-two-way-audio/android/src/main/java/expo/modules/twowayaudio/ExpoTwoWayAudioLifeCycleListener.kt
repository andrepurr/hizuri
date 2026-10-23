package expo.modules.twowayaudio

import android.app.Activity
import expo.modules.core.interfaces.ReactActivityLifecycleListener

class ExpoTwoWayAudioLifeCycleListener : ReactActivityLifecycleListener {
    // True when onPause left capture running because voice mode holds the foreground service.
    private var keptRunningInBackground = false

    override fun onPause(activity: Activity?) {
        super.onPause(activity)
        if (VoiceForegroundService.isRunning) {
            // Voice mode: the foreground service keeps the mic and speaker alive in the background.
            keptRunningInBackground = true
            return
        }
        ExpoTwoWayAudioModule.audioEngine?.pauseRecordingAndPlayer()
    }

    override fun onResume(activity: Activity?) {
        super.onResume(activity)
        if (keptRunningInBackground) {
            // Nothing was paused, so there is nothing to resume.
            keptRunningInBackground = false
            return
        }
        ExpoTwoWayAudioModule.audioEngine?.resumeRecordingAndPlayer()
    }
}
