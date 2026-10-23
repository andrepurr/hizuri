package expo.modules.twowayaudio

import android.media.AudioDeviceInfo

/**
 * How voice mode plays replies and where it listens.
 *
 * - [COMMUNICATION]: the call path. `MODE_IN_COMMUNICATION`, replies as
 *   `USAGE_VOICE_COMMUNICATION`, and a communication device (headset, wired, speaker).
 * - [MEDIA]: the media path, for Bluetooth headphones that cannot take calls (A2DP only, no
 *   microphone). `MODE_NORMAL`, replies as `USAGE_ASSISTANT`, the phone's own microphone.
 *   The call path cannot reach such headphones: A2DP is not a valid communication device, and
 *   while any app holds `MODE_IN_COMMUNICATION` the audio policy treats media as call audio and
 *   drops A2DP outputs, so even other apps' media would leave the headphones.
 */
enum class VoiceRoute(val label: String) {
    COMMUNICATION("communication"),
    MEDIA("media"),
}

/** The parts of an [AudioDeviceInfo] the policy needs; plain data so it runs in JVM tests. */
data class RouteDevice(val type: Int, val name: String = "", val address: String = "") {
    companion object {
        fun of(info: AudioDeviceInfo): RouteDevice =
            RouteDevice(info.type, info.productName?.toString() ?: "", info.address ?: "")
    }
}

data class RouteDecision(
    val route: VoiceRoute,
    /** COMMUNICATION: the device for `setCommunicationDevice`. MEDIA: the headphones. */
    val output: RouteDevice?,
    /** MEDIA only: the built-in microphone to prefer. COMMUNICATION leaves input to Android. */
    val input: RouteDevice?,
    val reason: String,
) {
    /** One log line, e.g. `route=media out=bt_a2dp("BT Speaker") in=builtin_mic(bottom) reason=...`. */
    fun describe(): String = buildString {
        append("route=").append(route.label)
        append(" out=").append(output?.let(::describeDevice) ?: "default")
        append(" in=").append(input?.let(::describeDevice) ?: "default")
        append(" reason=").append(reason)
    }
}

object VoiceRoutePolicy {
    /** Test override values for the `debug.hizuri.audio_route` system property. */
    const val OVERRIDE_MEDIA = "media"
    const val OVERRIDE_COMMUNICATION = "communication"

    /** Bluetooth outputs without a microphone: classic A2DP and LE Audio sink-only devices. */
    private val MEDIA_ONLY_BLUETOOTH = setOf(
        AudioDeviceInfo.TYPE_BLUETOOTH_A2DP,
        AudioDeviceInfo.TYPE_BLE_SPEAKER,
    )

    /** Bluetooth outputs that carry a microphone and take calls (HFP / LE Audio headset). */
    private val CALL_CAPABLE_BLUETOOTH = setOf(
        AudioDeviceInfo.TYPE_BLUETOOTH_SCO,
        AudioDeviceInfo.TYPE_BLE_HEADSET,
    )

    private val WIRED = setOf(
        AudioDeviceInfo.TYPE_WIRED_HEADSET,
        AudioDeviceInfo.TYPE_WIRED_HEADPHONES,
        AudioDeviceInfo.TYPE_USB_HEADSET,
    )

    /**
     * The communication device to pick, in order. External devices beat the speaker, as before;
     * the earpiece is never chosen (voice mode is hands-free).
     */
    private val COMMUNICATION_PRIORITY = listOf(
        AudioDeviceInfo.TYPE_BLUETOOTH_SCO,
        AudioDeviceInfo.TYPE_BLE_HEADSET,
        AudioDeviceInfo.TYPE_WIRED_HEADSET,
        AudioDeviceInfo.TYPE_WIRED_HEADPHONES,
        AudioDeviceInfo.TYPE_USB_HEADSET,
        AudioDeviceInfo.TYPE_BUILTIN_SPEAKER,
    )

    /**
     * @param outputs `getDevices(GET_DEVICES_OUTPUTS)`.
     * @param inputs `getDevices(GET_DEVICES_INPUTS)`.
     * @param communicationDevices `getAvailableCommunicationDevices()` on Android 12+, null below.
     * @param override `debug.hizuri.audio_route`: [OVERRIDE_MEDIA], [OVERRIDE_COMMUNICATION] or
     *   anything else for automatic.
     */
    fun decide(
        outputs: List<RouteDevice>,
        inputs: List<RouteDevice>,
        communicationDevices: List<RouteDevice>?,
        override: String? = null,
    ): RouteDecision {
        // Below Android 12 there is no list of communication devices; an HFP headset shows up as
        // a SCO output there too.
        val callDevices = communicationDevices ?: outputs
        val mediaOnly = outputs.firstOrNull { it.type in MEDIA_ONLY_BLUETOOTH }
        val callBluetooth = callDevices.any { it.type in CALL_CAPABLE_BLUETOOTH }
        val wired = outputs.any { it.type in WIRED }

        return when {
            override == OVERRIDE_MEDIA ->
                media(mediaOnly, inputs, "override")
            override == OVERRIDE_COMMUNICATION ->
                communication(callDevices, "override")
            mediaOnly != null && !callBluetooth && !wired ->
                media(mediaOnly, inputs, "bluetooth-media-only")
            callBluetooth -> communication(callDevices, "bluetooth-headset")
            wired -> communication(callDevices, "wired")
            else -> communication(callDevices, "no-headphones")
        }
    }

    private fun media(output: RouteDevice?, inputs: List<RouteDevice>, reason: String) =
        RouteDecision(VoiceRoute.MEDIA, output, builtInMic(inputs), reason)

    private fun communication(callDevices: List<RouteDevice>, reason: String): RouteDecision {
        val device = COMMUNICATION_PRIORITY.firstNotNullOfOrNull { type ->
            callDevices.firstOrNull { it.type == type }
        }
        return RouteDecision(VoiceRoute.COMMUNICATION, device, null, reason)
    }

    /**
     * The main built-in microphone. Phones list several (`bottom`, `back`, ...) under the same
     * type; the back one sits next to the camera and hears the room more than the mouth.
     */
    fun builtInMic(inputs: List<RouteDevice>): RouteDevice? {
        val mics = inputs.filter { it.type == AudioDeviceInfo.TYPE_BUILTIN_MIC }
        return mics.firstOrNull { it.address.equals("bottom", ignoreCase = true) }
            ?: mics.firstOrNull { !it.address.equals("back", ignoreCase = true) }
            ?: mics.firstOrNull()
    }
}

private fun describeDevice(device: RouteDevice): String {
    val type = when (device.type) {
        AudioDeviceInfo.TYPE_BLUETOOTH_A2DP -> "bt_a2dp"
        AudioDeviceInfo.TYPE_BLUETOOTH_SCO -> "bt_sco"
        AudioDeviceInfo.TYPE_BLE_HEADSET -> "ble_headset"
        AudioDeviceInfo.TYPE_BLE_SPEAKER -> "ble_speaker"
        AudioDeviceInfo.TYPE_WIRED_HEADSET -> "wired_headset"
        AudioDeviceInfo.TYPE_WIRED_HEADPHONES -> "wired_headphones"
        AudioDeviceInfo.TYPE_USB_HEADSET -> "usb_headset"
        AudioDeviceInfo.TYPE_BUILTIN_SPEAKER -> "speaker"
        AudioDeviceInfo.TYPE_BUILTIN_EARPIECE -> "earpiece"
        AudioDeviceInfo.TYPE_BUILTIN_MIC -> "builtin_mic"
        else -> "type${device.type}"
    }
    val detail = when {
        device.type == AudioDeviceInfo.TYPE_BUILTIN_MIC -> device.address
        else -> device.name
    }
    return if (detail.isBlank()) type else "$type(\"${detail.replace("\"", "'")}\")"
}
