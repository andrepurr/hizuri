import android.annotation.SuppressLint
import android.content.Context
import android.media.AudioAttributes
import android.media.AudioDeviceInfo
import android.media.AudioFocusRequest
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioRecord
import android.media.AudioRecordingConfiguration
import android.media.AudioTimestamp
import android.media.AudioTrack
import android.media.MediaRecorder
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.util.Log
import androidx.annotation.RequiresApi
import expo.modules.twowayaudio.PlaybackClock
import expo.modules.twowayaudio.RouteDecision
import expo.modules.twowayaudio.RouteDevice
import expo.modules.twowayaudio.VoiceRoute
import expo.modules.twowayaudio.VoiceRoutePolicy
import java.util.LinkedList
import java.util.Queue
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicLong
import kotlin.math.pow


class AudioEngine (context: Context) {
    private companion object {
        /** Longer than one paced reply chunk, so the music is not unducked between chunks. */
        const val FOCUS_RELEASE_DELAY_MS = 2_000L

        /**
         * 100 ms of 16 kHz mono PCM16. A whole spoken reply can arrive as one chunk; writing it in
         * slices lets [playSample] poll the playback timestamps while it plays.
         */
        const val WRITE_SLICE_BYTES = 3_200

        /**
         * Test override for the route: `adb shell setprop debug.hizuri.audio_route media`
         * (or `communication`; empty = automatic). Only adb can set `debug.*` properties.
         */
        const val ROUTE_OVERRIDE_PROPERTY = "debug.hizuri.audio_route"

        private val systemPropertiesGet by lazy {
            try {
                Class.forName("android.os.SystemProperties").getMethod("get", String::class.java)
            } catch (e: Throwable) {
                null
            }
        }
    }

    private val SAMPLE_RATE = 16000
    private val AUDIO_FORMAT = AudioFormat.ENCODING_PCM_16BIT
    private val CHANNEL_CONFIG = AudioFormat.CHANNEL_IN_MONO

    private lateinit var audioRecord: AudioRecord
    private lateinit var audioManager: AudioManager
    /** Replies on the call path (`USAGE_VOICE_COMMUNICATION`), see [VoiceRoute.COMMUNICATION]. */
    private lateinit var communicationTrack: AudioTrack
    /** Replies on the media path (`USAGE_ASSISTANT`), see [VoiceRoute.MEDIA]. */
    private lateinit var mediaTrack: AudioTrack
    /** When written frames become audible, per track (see [outputTiming]). */
    private val communicationClock = PlaybackClock(SAMPLE_RATE)
    private val mediaClock = PlaybackClock(SAMPLE_RATE)
    private val timestamp = AudioTimestamp()
    /** Bytes in [audioSampleQueue], readable from the JS thread without touching the queue. */
    private val queuedBytes = AtomicLong(0)
    /**
     * The route the playback thread writes to. Written under [routeLock]; the track for the new
     * route is already playing when this changes, so a write never lands in a paused track.
     */
    @Volatile private var route = VoiceRoute.COMMUNICATION
    /** Whether the session wants the active track running (started between replies). */
    @Volatile private var trackStarted = false
    private val routeLock = Any()
    /** MEDIA: the built-in mic for [audioRecord]; null leaves the choice to Android. */
    private var preferredInput: AudioDeviceInfo? = null
    /** The last route reported to JS; reset on release so every voice start logs it once. */
    var routeDescription: String? = null
        private set
    /** Held only while a reply plays; capture never needs audio focus. Guarded by [focusLock]. */
    private var audioFocusRequest: AudioFocusRequest? = null
    private val focusLock = Any()
    private val mainHandler = Handler(Looper.getMainLooper())
    private val abandonFocusWhenIdle = Runnable { abandonPlaybackFocusIfIdle() }
    private val audioSampleQueue: Queue<ByteArray> = LinkedList()
    private val executorServiceMicrophone = Executors.newFixedThreadPool(1)
    private val executorServicePlayback = Executors.newFixedThreadPool(1)
    /**
     * DICTATION is Paseo's composer microphone: while Android silences the input it sends nothing.
     * CONVERSATION is voice mode, which keeps its continuous stream (the daemon's VAD needs it).
     */
    private enum class CaptureMode { CONVERSATION, DICTATION }
    private var captureMode = CaptureMode.CONVERSATION
    @Volatile private var captureSilenced = false
    private val recordingCallback = object : AudioManager.AudioRecordingCallback() {
        override fun onRecordingConfigChanged(configs: MutableList<AudioRecordingConfiguration>) {
            if (!isRecording || !::audioRecord.isInitialized) return
            val config = configs.firstOrNull { it.clientAudioSessionId == audioRecord.audioSessionId }
                ?: return
            setCaptureSilenced(config.isClientSilenced)
        }
    }
    private val deviceCallback = object : android.media.AudioDeviceCallback() {
        override fun onAudioDevicesAdded(addedDevices: Array<out AudioDeviceInfo>?) {
            Log.d("AudioEngine", "onAudioDevicesAdded")
            if (routeActive) {
                updateRoute()
            }
        }
        override fun onAudioDevicesRemoved(removedDevices: Array<out AudioDeviceInfo>?) {
            Log.d("AudioEngine", "onAudioDevicesRemoved")
            if (routeActive) {
                updateRoute()
            }
        }
    }
    private var routeActive = false
    private var bridgeWindowStartedAtMs = System.currentTimeMillis()
    private var micEvents = 0
    private var micBytes = 0L
    private var playbackEvents = 0
    private var playbackQueuedBytes = 0L
    private var playbackWrites = 0
    private var playbackWriteBytes = 0L

    @Volatile var isRecording = false
    private var isRecordingBeforePause = false
    var isPlaying = false

    // Callbacks
    var onMicDataCallback: ((ByteArray) -> Unit)? = null
    var onInputVolumeCallback: ((Float) -> Unit)? = null
    var onOutputVolumeCallback: ((Float) -> Unit)? = null
    var onAudioInterruptionCallback: ((String) -> Unit)? = null
    /** `route=... out=... in=... reason=...` whenever the chosen route changes. */
    var onRouteChangeCallback: ((String) -> Unit)? = null

    init {
        initializeAudio(context)
    }

    private fun flushBridgeStats(reason: String) {
        val now = System.currentTimeMillis()
        val elapsedMs = now - bridgeWindowStartedAtMs
        if (elapsedMs < 1000) {
            return
        }
        Log.d(
            "AudioEngine",
            "[bridge] $reason mic=$micEvents" +
                "ev/${micBytes}B playbackQueue=$playbackEvents" +
                "ev/${playbackQueuedBytes}B playbackWrites=$playbackWrites" +
                "ev/${playbackWriteBytes}B windowMs=$elapsedMs"
        )
        bridgeWindowStartedAtMs = now
        micEvents = 0
        micBytes = 0
        playbackEvents = 0
        playbackQueuedBytes = 0
        playbackWrites = 0
        playbackWriteBytes = 0
    }

    @SuppressLint("NewApi")
    private fun initializeAudio(context:Context) {
        audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager

        val bufferSize = AudioTrack.getMinBufferSize(
            SAMPLE_RATE,
            AudioFormat.CHANNEL_OUT_MONO,
            AUDIO_FORMAT
        )
        communicationTrack = createTrack(AudioAttributes.USAGE_VOICE_COMMUNICATION, bufferSize)
        // USAGE_ASSISTANT + CONTENT_TYPE_SPEECH is in the media strategy (AOSP
        // EngineDefaultConfig.h), so it plays wherever media plays, A2DP headphones included.
        mediaTrack = createTrack(AudioAttributes.USAGE_ASSISTANT, bufferSize)

        // No audio focus here: focus is requested per reply (see acquireAudioSessionIfNeeded), so
        // opening voice mode never pauses the music or video the user is playing.
        activateRoute()
        startTrack()

        // Listen for changes in audio routing and for Android silencing the microphone
        audioManager.registerAudioDeviceCallback(deviceCallback, mainHandler)
        audioManager.registerAudioRecordingCallback(recordingCallback, mainHandler)
    }

    private fun createTrack(usage: Int, bufferSize: Int): AudioTrack =
        AudioTrack(
            AudioAttributes.Builder()
                .setUsage(usage)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .build(),
            AudioFormat.Builder()
                .setEncoding(AUDIO_FORMAT)
                .setSampleRate(SAMPLE_RATE)
                .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                .build(),
            bufferSize,
            AudioTrack.MODE_STREAM,
            audioManager.generateAudioSessionId()
        )

    private fun trackFor(route: VoiceRoute): AudioTrack =
        if (route == VoiceRoute.MEDIA) mediaTrack else communicationTrack

    private fun activeTrack(): AudioTrack = trackFor(route)

    private fun clockFor(track: AudioTrack): PlaybackClock =
        if (track === mediaTrack) mediaClock else communicationClock

    /** Feeds the track's latest playback timestamp to its clock. */
    private fun pollTimestamp(track: AudioTrack, clock: PlaybackClock) {
        // The playback thread and the JS thread both poll; they share one timestamp object.
        synchronized(timestamp) {
            if (track.getTimestamp(timestamp)) {
                clock.onTimestamp(timestamp.framePosition, timestamp.nanoTime)
            }
        }
    }

    /**
     * When a chunk handed over now becomes audible: `audibleInMs` from now, from the track's
     * playback timestamps (AudioTrack.getTimestamp) and the frames still ahead of it. Null while
     * the track gives no timestamp; the caller then keeps its estimate. The assistant's face
     * opens its mouth on it.
     */
    fun outputTiming(): Map<String, Any>? {
        if (!::communicationTrack.isInitialized) return null
        val track = activeTrack()
        val clock = clockFor(track)
        pollTimestamp(track, clock)
        val now = System.nanoTime()
        val audibleInMs = clock.audibleInMs(now, queuedBytes.get() / 2) ?: return null
        return mapOf(
            "audibleInMs" to audibleInMs,
            "startLatencyMs" to clock.startLatency,
            "measured" to clock.isMeasured,
            "clock" to clock.diagnostics(now),
        )
    }

    private fun startTrack() {
        trackStarted = true
        activeTrack().play()
    }

    private fun pauseTracks() {
        trackStarted = false
        communicationTrack.pause()
        mediaTrack.pause()
    }

    /** Moves playback to the other track; the new one runs before the playback thread sees it. */
    private fun switchTrack(next: VoiceRoute) {
        if (route == next) return
        val from = activeTrack()
        val to = trackFor(next)
        if (trackStarted) {
            to.flush()
            clockFor(to).reset()
            to.play()
        }
        route = next
        // Pausing interrupts a blocked write on the old track; playSample sends the rest of
        // that chunk to the new one.
        from.pause()
        from.flush()
        clockFor(from).reset()
    }

    private fun routeOverride(): String? =
        try {
            (systemPropertiesGet?.invoke(null, ROUTE_OVERRIDE_PROPERTY) as? String)
                ?.trim()
                ?.takeIf { it.isNotEmpty() }
        } catch (e: Throwable) {
            null
        }

    /**
     * Chooses the route from the connected devices and applies it: the audio mode, the
     * communication device, the playback track and the preferred microphone.
     */
    @SuppressLint("NewApi")
    private fun updateRoute() = synchronized(routeLock) {
        val outputs = audioManager.getDevices(AudioManager.GET_DEVICES_OUTPUTS).toList()
        val inputs = audioManager.getDevices(AudioManager.GET_DEVICES_INPUTS).toList()
        val communicationDevices =
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                audioManager.availableCommunicationDevices
            } else {
                null
            }
        val decision = VoiceRoutePolicy.decide(
            outputs.map(RouteDevice::of),
            inputs.map(RouteDevice::of),
            communicationDevices?.map(RouteDevice::of),
            routeOverride(),
        )

        when (decision.route) {
            VoiceRoute.COMMUNICATION -> {
                audioManager.mode = AudioManager.MODE_IN_COMMUNICATION
                setCommunicationOutput(decision, communicationDevices ?: outputs)
            }
            VoiceRoute.MEDIA -> {
                // Leave the call path first: in MODE_IN_COMMUNICATION the audio policy routes
                // media like a call and removes A2DP outputs (AOSP Engine.cpp, isInCall()).
                clearCommunicationOutput()
                audioManager.mode = AudioManager.MODE_NORMAL
            }
        }
        switchTrack(decision.route)
        preferInput(inputs.firstOrNull { RouteDevice.of(it) == decision.input })
        reportRoute(decision)
    }

    @SuppressLint("NewApi")
    private fun setCommunicationOutput(decision: RouteDecision, candidates: List<AudioDeviceInfo>) {
        val target = candidates.firstOrNull { RouteDevice.of(it) == decision.output }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            try {
                target?.let { audioManager.setCommunicationDevice(it) }
            } catch (e: Exception) {
                Log.e("AudioEngine", "Error setting communication device. Using speaker", e)
                candidates.firstOrNull { it.type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER }?.let {
                    audioManager.setCommunicationDevice(it)
                }
            }
        } else {
            // Fall back to deprecated method for older Android versions
            @Suppress("DEPRECATION")
            audioManager.isSpeakerphoneOn =
                target == null || target.type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER
        }
    }

    @SuppressLint("NewApi")
    private fun clearCommunicationOutput() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            audioManager.clearCommunicationDevice()
        } else {
            @Suppress("DEPRECATION")
            audioManager.isSpeakerphoneOn = false
        }
    }

    /** Applies to the next capture and moves a running one. */
    private fun preferInput(device: AudioDeviceInfo?) {
        preferredInput = device
        if (isRecording && ::audioRecord.isInitialized) {
            try {
                audioRecord.setPreferredDevice(device)
            } catch (e: Exception) {
                Log.w("AudioEngine", "Could not move the microphone to ${device?.productName}", e)
            }
        }
    }

    private fun reportRoute(decision: RouteDecision) {
        val description = decision.describe()
        if (description == routeDescription) return
        routeDescription = description
        Log.i("AudioEngine", "[audio] $description")
        onRouteChangeCallback?.invoke(description)
    }

    private fun activateRoute() {
        routeActive = true
        updateRoute()
    }

    @SuppressLint("NewApi")
    private fun releaseRoute() = synchronized(routeLock) {
        routeActive = false
        routeDescription = null
        clearCommunicationOutput()
        audioManager.mode = AudioManager.MODE_NORMAL
    }

    /**
     * Give the complete communication session back once we are neither recording nor playing.
     * Held focus ducks the user's music, while MODE_IN_COMMUNICATION and the selected communication
     * device can leave Bluetooth earbuds on their narrow-band call route after capture stops.
     */
    @SuppressLint("NewApi")
    fun releaseAudioSession() {
        if (isRecording || isPlaying) {
            return
        }
        mainHandler.removeCallbacks(abandonFocusWhenIdle)
        abandonPlaybackFocus()
        if (::communicationTrack.isInitialized) {
            pauseTracks()
        }
        releaseRoute()
    }

    /**
     * Take ducking focus (and the route, if released) before a reply chunk plays.
     *
     * A null [audioFocusRequest] means "not holding focus": nothing played yet, the reply ended
     * and [abandonFocusWhenIdle] gave it back, or another app took it. Each case asks again, so
     * a reply that outlives a focus loss ducks the other app again on its next chunk.
     *
     * Focus is best effort, and deliberately not fatal. `playPCMData` is fire-and-forget from
     * JS (`playAudio()` settles on a duration timer, not on a native ack), so refusing to queue
     * would report a chunk as played that nobody heard.
     */
    @SuppressLint("NewApi")
    private fun acquireAudioSessionIfNeeded() {
        mainHandler.removeCallbacks(abandonFocusWhenIdle)
        if (synchronized(focusLock) { audioFocusRequest != null }) {
            return
        }
        if (!routeActive) {
            activateRoute()
        }
        requestPlaybackFocus()
        if (::communicationTrack.isInitialized) {
            startTrack()
        }
    }

    /**
     * Duck other apps while a reply plays. USAGE_ASSISTANT with GAIN_TRANSIENT_MAY_DUCK is the
     * assistant case of automatic ducking (API 26+): the system lowers the music or video of the
     * focus owner (AOSP applies its strong duck for assistant requests) and restores it when we
     * abandon. The other app is not paused and is not even notified.
     */
    @SuppressLint("NewApi")
    private fun requestPlaybackFocus(): Boolean {
        val focusRequest =
            AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
                .setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ASSISTANT)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                        .build()
                )
                .setOnAudioFocusChangeListener({ focusChange ->
                    when (focusChange) {
                        AudioManager.AUDIOFOCUS_LOSS,
                        AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> {
                            // Another app started playing (a video, a reel, music). Voice mode and
                            // the microphone go on; the reply keeps playing and its next chunk asks
                            // for focus again, which ducks that app once more.
                            Log.d("AudioEngine", "Playback focus lost ($focusChange); capture continues")
                            abandonPlaybackFocus()
                        }
                        else -> Log.d("AudioEngine", "Playback focus change $focusChange")
                    }
                }, mainHandler)
                .build()

        val result = audioManager.requestAudioFocus(focusRequest)
        if (result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED) {
            synchronized(focusLock) { audioFocusRequest = focusRequest }
            return true
        }
        // A phone call holds focus. Play anyway; Android mutes other audio during calls itself.
        Log.w("AudioEngine", "Playback focus not granted: $result")
        return false
    }

    @SuppressLint("NewApi")
    private fun abandonPlaybackFocus() {
        val request = synchronized(focusLock) {
            val current = audioFocusRequest
            audioFocusRequest = null
            current
        } ?: return
        audioManager.abandonAudioFocusRequest(request)
    }

    /** Give the ducked app its volume back once a reply has finished playing. */
    private fun abandonPlaybackFocusIfIdle() {
        if (isPlaying || audioSampleQueue.isNotEmpty()) {
            return
        }
        abandonPlaybackFocus()
    }

    private fun scheduleFocusRelease() {
        mainHandler.removeCallbacks(abandonFocusWhenIdle)
        mainHandler.postDelayed(abandonFocusWhenIdle, FOCUS_RELEASE_DELAY_MS)
    }

    @RequiresApi(Build.VERSION_CODES.Q)
    @SuppressLint("MissingPermission")
    private fun startRecording(): Boolean {
        // Capture does not take audio focus: focus is about output, and holding it would pause
        // whatever the user plays (reels, videos, music) for as long as voice mode is on.
        activateRoute()

        val bufferSize = AudioRecord.getMinBufferSize(SAMPLE_RATE, CHANNEL_CONFIG, AUDIO_FORMAT)
        // Capture with VOICE_RECOGNITION and no AcousticEchoCanceler / NoiseSuppressor.
        // VOICE_COMMUNICATION plus those effects is the phone-call pipeline: on some devices it
        // sends digital silence while the assistant is speaking (no barge-in) and erases quiet
        // speech such as whispers. A raw capture keeps barge-in and quiet speech intact.
        audioRecord = AudioRecord(
            MediaRecorder.AudioSource.VOICE_RECOGNITION,
            SAMPLE_RATE,
            CHANNEL_CONFIG,
            AUDIO_FORMAT,
            bufferSize
        )

        if (audioRecord.state != AudioRecord.STATE_INITIALIZED) {
            throw RuntimeException("Audio Record can't initialize!")
        }
        // MEDIA route: the phone's own mic (the headphones have none). Otherwise Android picks.
        preferredInput?.let { audioRecord.setPreferredDevice(it) }

        audioRecord.startRecording()
        isRecording = true
        setCaptureSilenced(audioRecord.activeRecordingConfiguration?.isClientSilenced ?: false)
        startMicSampleTap(audioRecord)
        return true
    }

    private fun setCaptureSilenced(silenced: Boolean) {
        if (captureSilenced == silenced) return
        captureSilenced = silenced
        if (silenced) onInputVolumeCallback?.invoke(0.0F)
        onAudioInterruptionCallback?.invoke(if (silenced) "capture_paused" else "capture_resumed")
    }

    private fun startMicSampleTap(recorder: AudioRecord){
        executorServiceMicrophone.execute {
            val buffer = ByteArray(1024)
            try {
                while (isRecording && audioRecord === recorder) {
                    val read = recorder.read(buffer, 0, buffer.size)
                    if (!isRecording || audioRecord !== recorder) break
                    if (read < 0) throw IllegalStateException("AudioRecord read failed: $read")
                    val dropSilenced = captureSilenced && captureMode == CaptureMode.DICTATION
                    if (read > 0 && !dropSilenced) {
                        val data = buffer.copyOf(read)
                        micEvents += 1
                        micBytes += data.size.toLong()
                        flushBridgeStats("mic")
                        val micVolume = calculateRMSLevel(data)
                        onInputVolumeCallback?.invoke(micVolume)
                        onMicDataCallback?.invoke(data)
                    }
                }
                Log.d("AudioEngine", "Mic sample tap stopped.")
            }catch (e: Exception){
                Log.e("AudioEngine", "Error reading mic sample data", e)
                mainHandler.post {
                    if (isRecording && audioRecord === recorder) {
                        stopRecording()
                        releaseAudioSession()
                        onAudioInterruptionCallback?.invoke("blocked")
                    }
                }
            }
        }
    }

    private fun stopRecording() {
        if (!isRecording) return
        isRecording = false
        if (audioRecord.recordingState == AudioRecord.RECORDSTATE_RECORDING) {
            audioRecord.stop()
        }
        audioRecord.release()
        setCaptureSilenced(false)
        onInputVolumeCallback?.invoke(0.0F)
    }

    @RequiresApi(Build.VERSION_CODES.Q)
    fun startDictation(): Boolean {
        isRecordingBeforePause = false
        if (isRecording) return true
        captureMode = CaptureMode.DICTATION
        return startRecording()
    }

    @RequiresApi(Build.VERSION_CODES.Q)
    fun toggleRecording(value: Boolean): Boolean {
        isRecordingBeforePause = false
        if (value == isRecording) return isRecording

        if (value) {
            captureMode = CaptureMode.CONVERSATION
            return startRecording()
        } else {
            stopRecording()
        }

        isRecording = value
        return isRecording
    }

    @SuppressLint("NewApi")
    fun playPCMData(data: ByteArray) {
        acquireAudioSessionIfNeeded()
        queuedBytes.addAndGet(data.size.toLong())
        audioSampleQueue.add(data)
        playbackEvents += 1
        playbackQueuedBytes += data.size.toLong()
        Log.d(
            "AudioEngine",
            "playPCMData queued bytes=${data.size} queueSize=${audioSampleQueue.size} " +
                "head=${data.take(12).joinToString(" ") { byte -> "%02x".format(byte.toInt() and 0xff) }}"
        )
        flushBridgeStats("queue")
        if (!isPlaying) {
            playAudioFromSampleQueue()
        }
    }

    private fun playAudioFromSampleQueue() {
        executorServicePlayback.execute{
            isPlaying = true
            try {
                while (audioSampleQueue.isNotEmpty()){
                    val data = audioSampleQueue.poll()
                    if (data != null){
                        queuedBytes.addAndGet(-data.size.toLong())
                        playSample(data)
                        val audioVolume = calculateRMSLevel(data)
                        onOutputVolumeCallback?.invoke(audioVolume)
                    }else{
                        break
                    }
                }
            }catch (e: Exception){
                Log.e("AudioEngine", "Error playing audio", e)
                e.printStackTrace()
            }finally {
                isPlaying = false
                onOutputVolumeCallback?.invoke(0.0F)
                scheduleFocusRelease()
            }
        }
    }

    private fun playSample(data: ByteArray) {
        var track = activeTrack()
        var offset = 0
        while (true) {
            val clock = clockFor(track)
            pollTimestamp(track, clock)
            val writeNanos = System.nanoTime()
            val size = minOf(WRITE_SLICE_BYTES, data.size - offset)
            val written = track.write(data, offset, size)
            if (written > 0) {
                clock.onWrite(written / 2, writeNanos)
                offset += written
            }
            if (offset >= data.size) break
            if (written == size) continue
            // A short write: the track was paused (stop, barge-in) or the route moved to the
            // other track (headphones connected or removed); only the second one continues.
            val next = activeTrack()
            if (next === track) break
            track = next
        }
        playbackWrites += 1
        playbackWriteBytes += offset.toLong()
        Log.d(
            "AudioEngine",
            "playSample wrote=$offset requested=${data.size} playState=${track.playState} " +
                "route=${route.label} queueSize=${audioSampleQueue.size}"
        )
        flushBridgeStats("write")
    }

    /**
     * No-op: capture never enables platform voice processing (see [startRecording]), so there is
     * nothing to bypass. Kept because the module still exposes `bypassVoiceProcessing` to JS.
     */
    @Suppress("UNUSED_PARAMETER")
    fun bypassVoiceProcessing(bypass: Boolean) = Unit

    @RequiresApi(Build.VERSION_CODES.Q)
    fun pauseRecordingAndPlayer() {
        isRecordingBeforePause = isRecording
        stopRecording()
        pauseTracks()
    }

    @RequiresApi(Build.VERSION_CODES.Q)
    fun resumeRecordingAndPlayer() {
        val wasRecordingBeforePause = isRecordingBeforePause
        // Only take the session back if something was actually live when we backgrounded. The
        // activity lifecycle listener calls this on every onResume, so requesting
        // AUDIOFOCUS_GAIN_TRANSIENT_EXCLUSIVE unconditionally re-paused the user's music every
        // time the app came to the foreground — the exact symptom this change exists to remove.
        if (!wasRecordingBeforePause && !isPlaying) {
            return
        }
        isRecordingBeforePause = false
        activateRoute()
        // startRecording keeps the capture mode the session had before it was backgrounded.
        if (wasRecordingBeforePause && !isRecording && !startRecording()) {
            return
        }
        startTrack()
    }

    fun stopPlayback() {
        audioSampleQueue.clear()
        queuedBytes.set(0)
        pauseTracks()
        communicationTrack.flush()
        mediaTrack.flush()
        communicationClock.reset()
        mediaClock.reset()
        isPlaying = false
        onOutputVolumeCallback?.invoke(0.0F)
        scheduleFocusRelease()
        Log.d("AudioEngine", "Playback stopped")
    }

    fun pausePlayback() {
        pauseTracks()
        Log.d("AudioEngine", "Playback paused")
    }

    @SuppressLint("NewApi")
    fun resumePlayback() {
        acquireAudioSessionIfNeeded()
        startTrack()
        Log.d("AudioEngine", "Playback resumed")
    }

    @SuppressLint("NewApi")
    fun tearDown() {
        stopRecording()
        communicationTrack.stop()
        mediaTrack.stop()
        releaseRoute()
        mainHandler.removeCallbacks(abandonFocusWhenIdle)
        abandonPlaybackFocus()
        audioManager.unregisterAudioDeviceCallback(deviceCallback)
        audioManager.unregisterAudioRecordingCallback(recordingCallback)
        communicationTrack.release()
        mediaTrack.release()
        executorServiceMicrophone.shutdownNow()
        executorServicePlayback.shutdownNow()
    }


    private fun calculateRMSLevel(buffer: ByteArray): Float {
        val epsilon = 1e-5f // To avoid log(0)

        // Convert ByteArray to FloatArray by treating each pair of bytes as a single 16-bit PCM sample
        val floatBuffer = FloatArray(buffer.size / 2)
        for (i in floatBuffer.indices) {
            // Combine two bytes into a 16-bit signed integer
            val sample = (buffer[i * 2].toInt() or (buffer[i * 2 + 1].toInt() shl 8)).toShort()
            // Normalize sample to -1.0 to 1.0 range for FloatArray
            floatBuffer[i] = sample / 32768.0f
        }

        // Calculate RMS value
        val rmsValue = kotlin.math.sqrt(floatBuffer.fold(0f) { acc, sample -> acc + sample * sample } / floatBuffer.size)

        // Convert to decibels
        val dbValue = 20 * kotlin.math.log10(maxOf(rmsValue, epsilon))

        // Normalize decibel value to 0-1 range
        // Assuming minimum audible is -80dB and maximum is 0dB
        val minDb = -80.0f
        val normalizedValue = maxOf(0.0f, minOf(1.0f, (dbValue - minDb) / kotlin.math.abs(minDb)))

        // Optional: Apply exponential factor to push smaller values down
        val expFactor = 2.0f // Adjust this value to change the curve
        val adjustedValue = normalizedValue.pow(expFactor)

        return adjustedValue
    }

}
