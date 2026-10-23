package expo.modules.twowayaudio

/**
 * When a frame handed to the player becomes audible, from the track's own playback timestamps
 * (`AudioTrack.getTimestamp`: a frame position and the moment it is presented). The assistant's
 * face opens the mouth on this, so the lips follow the speaker instead of a fixed latency guess.
 *
 * Frames are counted from the last flush of the track, the same origin as the timestamp's frame
 * position. Pure arithmetic over the values the engine passes in, so it runs in JVM tests.
 */
class PlaybackClock(private val sampleRate: Int) {
  companion object {
    /** Until the first measurement: the old fixed estimate for a 16 kHz AudioTrack. */
    const val DEFAULT_START_LATENCY_MS = 60.0
    /** A measured start latency outside this range is a stale or broken timestamp. */
    const val MAX_START_LATENCY_MS = 1_000.0
  }

  /** Frames written into the track since its last flush. */
  var framesWritten = 0L
    private set
  /** Write moment (ns) of the first frame after the track ran dry, until a timestamp covers it. */
  private var burstStartFrame = -1L
  private var burstWriteNanos = 0L
  private var startLatencyMs = DEFAULT_START_LATENCY_MS
  private var measured = false
  private var lastPositionFrame = -1L
  private var lastPositionNanos = 0L
  // Diagnostics for the `[audio] output-timing` log line, over the clock's whole life.
  private var resets = 0
  private var timestampsSeen = 0
  private var timestampsIgnored = 0
  private var bursts = 0
  private var lastRawFrame = -1L
  private var lastRawNanos = 0L
  private var lastRejectedMs = Double.NaN

  /** The track was flushed (stop, barge-in, route switch): positions start again at zero. */
  @Synchronized
  fun reset() {
    framesWritten = 0
    burstStartFrame = -1
    lastPositionFrame = -1
    resets++
  }

  /** A fresh `getTimestamp` result. */
  @Synchronized
  fun onTimestamp(framePosition: Long, presentedNanos: Long) {
    timestampsSeen++
    lastRawFrame = framePosition
    lastRawNanos = presentedNanos
    if (framePosition < 0 || framePosition > framesWritten) {
      timestampsIgnored++
      return
    }
    lastPositionFrame = framePosition
    lastPositionNanos = presentedNanos
    // A drained track reports its last frame with the poll's own time, not when that frame
    // played (seen on the emulator: a 34 s "latency"); the burst is over unmeasured.
    if (framePosition == framesWritten) {
      burstStartFrame = -1
      return
    }
    // Strictly past the burst's first frame: until the burst plays, the track keeps reporting its
    // last position (the burst's first frame) with the old presentation time, which would read
    // as a negative latency and use up the burst (seen on the emulator: never measured).
    if (burstStartFrame >= 0 && framePosition > burstStartFrame) {
      val presentedAt = presentedNanos - framesToNanos(framePosition - burstStartFrame)
      val latencyMs = (presentedAt - burstWriteNanos) / 1e6
      if (latencyMs in 0.0..MAX_START_LATENCY_MS) {
        startLatencyMs = latencyMs
        measured = true
      } else {
        lastRejectedMs = latencyMs
      }
      burstStartFrame = -1
    }
  }

  /** Call right before [frames] more frames go into the track at [nowNanos]. */
  @Synchronized
  fun onWrite(frames: Int, nowNanos: Long) {
    if (burstStartFrame < 0 && aheadNanos(nowNanos) <= 0) {
      burstStartFrame = framesWritten
      burstWriteNanos = nowNanos
      bursts++
    }
    framesWritten += frames
  }

  /**
   * Milliseconds from [nowNanos] until a frame queued after [pendingFrames] not yet written
   * frames becomes audible: the frames still ahead of it, or the start latency when the track has
   * run dry (it then starts from silence). Null while the track has given no timestamp (warming
   * up, a route without timestamps): the caller keeps its own estimate.
   */
  @Synchronized
  fun audibleInMs(nowNanos: Long, pendingFrames: Long): Double? {
    if (lastPositionFrame < 0) return null
    val ahead = aheadNanos(nowNanos) + framesToNanos(pendingFrames)
    return maxOf(ahead / 1e6, startLatencyMs)
  }

  /** True once a timestamp has measured the start latency (else it is the default estimate). */
  val isMeasured: Boolean
    get() = measured

  val startLatency: Double
    get() = startLatencyMs

  /** What the clock has seen so far, for the `[audio] output-timing` log line. */
  @Synchronized
  fun diagnostics(nowNanos: Long): String =
    "ts=$timestampsSeen ignored=$timestampsIgnored bursts=$bursts resets=$resets written=$framesWritten " +
      "lastPos=$lastRawFrame age=${(nowNanos - lastRawNanos) / 1_000_000}ms rejected=${
        if (lastRejectedMs.isNaN()) "none" else "${lastRejectedMs.toLong()}ms"
      }"

  /** Written frames not yet presented, as time, extrapolated from the last timestamp. */
  private fun aheadNanos(nowNanos: Long): Long {
    if (lastPositionFrame < 0) return framesToNanos(framesWritten)
    val presentedNow = lastPositionFrame + nanosToFrames(nowNanos - lastPositionNanos)
    return framesToNanos(framesWritten - presentedNow).coerceAtLeast(0)
  }

  private fun framesToNanos(frames: Long): Long = frames * 1_000_000_000L / sampleRate

  private fun nanosToFrames(nanos: Long): Long = nanos * sampleRate / 1_000_000_000L
}
