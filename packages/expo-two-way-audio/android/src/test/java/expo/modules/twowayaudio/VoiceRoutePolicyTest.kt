package expo.modules.twowayaudio

import android.media.AudioDeviceInfo.TYPE_BLE_HEADSET
import android.media.AudioDeviceInfo.TYPE_BLE_SPEAKER
import android.media.AudioDeviceInfo.TYPE_BLUETOOTH_A2DP
import android.media.AudioDeviceInfo.TYPE_BLUETOOTH_SCO
import android.media.AudioDeviceInfo.TYPE_BUILTIN_EARPIECE
import android.media.AudioDeviceInfo.TYPE_BUILTIN_MIC
import android.media.AudioDeviceInfo.TYPE_BUILTIN_SPEAKER
import android.media.AudioDeviceInfo.TYPE_TELEPHONY
import android.media.AudioDeviceInfo.TYPE_USB_HEADSET
import android.media.AudioDeviceInfo.TYPE_WIRED_HEADPHONES
import android.media.AudioDeviceInfo.TYPE_WIRED_HEADSET
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class VoiceRoutePolicyTest {
    private val speaker = RouteDevice(TYPE_BUILTIN_SPEAKER, "Pixel", "")
    private val earpiece = RouteDevice(TYPE_BUILTIN_EARPIECE, "Pixel", "")
    private val telephony = RouteDevice(TYPE_TELEPHONY, "", "")
    private val bottomMic = RouteDevice(TYPE_BUILTIN_MIC, "Pixel", "bottom")
    private val backMic = RouteDevice(TYPE_BUILTIN_MIC, "Pixel", "back")
    private val btSpeaker = RouteDevice(TYPE_BLUETOOTH_A2DP, "BT Speaker", "AA:BB")
    private val budsMedia = RouteDevice(TYPE_BLUETOOTH_A2DP, "Buds", "CC:DD")
    private val budsCall = RouteDevice(TYPE_BLUETOOTH_SCO, "Buds", "CC:DD")
    private val budsCallMic = RouteDevice(TYPE_BLUETOOTH_SCO, "Buds", "CC:DD")
    private val leBuds = RouteDevice(TYPE_BLE_HEADSET, "LE Buds", "EE:FF")
    private val wiredHeadset = RouteDevice(TYPE_WIRED_HEADSET, "Headset", "")
    private val wiredHeadphones = RouteDevice(TYPE_WIRED_HEADPHONES, "Headphones", "")
    private val usbHeadset = RouteDevice(TYPE_USB_HEADSET, "USB", "")

    private val phoneInputs = listOf(backMic, bottomMic)

    @Test
    fun micLessBluetoothHeadphonesPlayAsMediaAndRecordWithThePhoneMic() {
        // A Bluetooth speaker: A2DP only, so Android lists no Bluetooth call device for it.
        val decision = VoiceRoutePolicy.decide(
            outputs = listOf(earpiece, speaker, telephony, btSpeaker),
            inputs = phoneInputs,
            communicationDevices = listOf(earpiece, speaker),
        )
        assertEquals(VoiceRoute.MEDIA, decision.route)
        assertEquals(btSpeaker, decision.output)
        assertEquals(bottomMic, decision.input)
        assertEquals("bluetooth-media-only", decision.reason)
        assertEquals(
            "route=media out=bt_a2dp(\"BT Speaker\") in=builtin_mic(\"bottom\") reason=bluetooth-media-only",
            decision.describe(),
        )
    }

    @Test
    fun leAudioHeadphonesWithoutAMicAlsoPlayAsMedia() {
        val leMask = RouteDevice(TYPE_BLE_SPEAKER, "LE Mask", "11:22")
        val decision = VoiceRoutePolicy.decide(
            outputs = listOf(speaker, leMask),
            inputs = phoneInputs,
            communicationDevices = listOf(earpiece, speaker, leMask),
        )
        assertEquals(VoiceRoute.MEDIA, decision.route)
        assertEquals(leMask, decision.output)
        assertEquals(bottomMic, decision.input)
    }

    @Test
    fun bluetoothHeadsetWithAMicStaysOnTheCallPath() {
        // Order-independent: a loop that stops at the first Bluetooth device, or an A2DP pick, would fail.
        for (outputs in listOf(
            listOf(speaker, budsMedia, budsCall),
            listOf(speaker, budsCall, budsMedia),
        )) {
            val decision = VoiceRoutePolicy.decide(
                outputs = outputs,
                inputs = phoneInputs + budsCallMic,
                communicationDevices = listOf(earpiece, speaker, budsCall),
            )
            assertEquals(VoiceRoute.COMMUNICATION, decision.route)
            assertEquals(budsCall, decision.output)
            assertNull(decision.input)
            assertEquals("bluetooth-headset", decision.reason)
        }
    }

    @Test
    fun leAudioHeadsetStaysOnTheCallPath() {
        val decision = VoiceRoutePolicy.decide(
            outputs = listOf(speaker, leBuds),
            inputs = phoneInputs,
            communicationDevices = listOf(earpiece, speaker, leBuds),
        )
        assertEquals(VoiceRoute.COMMUNICATION, decision.route)
        assertEquals(leBuds, decision.output)
    }

    @Test
    fun wiredHeadsetAndHeadphonesStayOnTheCallPath() {
        for (wired in listOf(wiredHeadset, wiredHeadphones, usbHeadset)) {
            val decision = VoiceRoutePolicy.decide(
                outputs = listOf(earpiece, speaker, wired),
                inputs = phoneInputs,
                communicationDevices = listOf(earpiece, speaker, wired),
            )
            assertEquals(VoiceRoute.COMMUNICATION, decision.route)
            assertEquals(wired, decision.output)
            assertEquals("wired", decision.reason)
        }
    }

    @Test
    fun wiredBeatsMicLessBluetoothHeadphones() {
        val decision = VoiceRoutePolicy.decide(
            outputs = listOf(speaker, btSpeaker, wiredHeadset),
            inputs = phoneInputs,
            communicationDevices = listOf(earpiece, speaker, wiredHeadset),
        )
        assertEquals(VoiceRoute.COMMUNICATION, decision.route)
        assertEquals(wiredHeadset, decision.output)
    }

    @Test
    fun noHeadphonesUsesTheSpeakerNeverTheEarpiece() {
        val decision = VoiceRoutePolicy.decide(
            outputs = listOf(earpiece, speaker, telephony),
            inputs = phoneInputs,
            communicationDevices = listOf(earpiece, speaker),
        )
        assertEquals(VoiceRoute.COMMUNICATION, decision.route)
        assertEquals(speaker, decision.output)
        assertEquals("no-headphones", decision.reason)
        assertEquals("route=communication out=speaker(\"Pixel\") in=default reason=no-headphones", decision.describe())
    }

    @Test
    fun belowAndroid12AScoOutputMarksACallHeadset() {
        val media = VoiceRoutePolicy.decide(listOf(speaker, btSpeaker), phoneInputs, null)
        assertEquals(VoiceRoute.MEDIA, media.route)

        val call = VoiceRoutePolicy.decide(listOf(speaker, budsMedia, budsCall), phoneInputs, null)
        assertEquals(VoiceRoute.COMMUNICATION, call.route)
        assertEquals(budsCall, call.output)
    }

    @Test
    fun overrideForcesEitherRoute() {
        val forcedMedia = VoiceRoutePolicy.decide(
            outputs = listOf(speaker),
            inputs = phoneInputs,
            communicationDevices = listOf(speaker),
            override = VoiceRoutePolicy.OVERRIDE_MEDIA,
        )
        assertEquals(VoiceRoute.MEDIA, forcedMedia.route)
        assertNull(forcedMedia.output)
        assertEquals(bottomMic, forcedMedia.input)
        assertEquals("override", forcedMedia.reason)

        val forcedCall = VoiceRoutePolicy.decide(
            outputs = listOf(speaker, btSpeaker),
            inputs = phoneInputs,
            communicationDevices = listOf(speaker),
            override = VoiceRoutePolicy.OVERRIDE_COMMUNICATION,
        )
        assertEquals(VoiceRoute.COMMUNICATION, forcedCall.route)
        assertEquals(speaker, forcedCall.output)

        val unknown = VoiceRoutePolicy.decide(listOf(speaker, btSpeaker), phoneInputs, listOf(speaker), "bogus")
        assertEquals(VoiceRoute.MEDIA, unknown.route)
        assertEquals("bluetooth-media-only", unknown.reason)
    }

    @Test
    fun builtInMicPrefersBottomThenAnyButBack() {
        assertEquals(bottomMic, VoiceRoutePolicy.builtInMic(listOf(backMic, bottomMic)))
        val unnamed = RouteDevice(TYPE_BUILTIN_MIC, "Pixel", "")
        assertEquals(unnamed, VoiceRoutePolicy.builtInMic(listOf(backMic, unnamed)))
        assertEquals(backMic, VoiceRoutePolicy.builtInMic(listOf(backMic)))
        assertNull(VoiceRoutePolicy.builtInMic(listOf(budsCallMic)))
    }
}
