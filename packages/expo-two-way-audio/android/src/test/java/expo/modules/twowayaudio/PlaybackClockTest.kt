package expo.modules.twowayaudio

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PlaybackClockTest {
  private val rate = 16_000
  private val ms = 1_000_000L

  /** 100 ms of 16 kHz audio. */
  private val chunk = 1_600

  @Test
  fun `no timestamp yet leaves the estimate to the caller`() {
    val clock = PlaybackClock(rate)
    clock.onWrite(chunk, 0)
    assertNull(clock.audibleInMs(10 * ms, 0))
    assertFalse(clock.isMeasured)
  }

  @Test
  fun `start latency is measured from the first timestamp that covers a fresh burst`() {
    val clock = PlaybackClock(rate)
    // Written at t=1000 ms into an empty track; frame 800 (50 ms in) is presented at 1130 ms,
    // so frame 0 was presented at 1080 ms: 80 ms after the write.
    clock.onWrite(chunk, 1_000 * ms)
    clock.onTimestamp(800, 1_130 * ms)
    assertTrue(clock.isMeasured)
    assertEquals(80.0, clock.startLatency, 0.01)
  }

  @Test
  fun `the old timestamp at the burst's first frame waits for a fresh one`() {
    val clock = PlaybackClock(rate)
    clock.onWrite(chunk, 1_000 * ms)
    clock.onTimestamp(chunk.toLong(), 1_150 * ms) // the first chunk played out at 1150 ms
    // A new burst long after; the track still reports where it stopped, with the old time.
    clock.onWrite(chunk, 5_000 * ms)
    clock.onTimestamp(chunk.toLong(), 1_150 * ms)
    clock.onTimestamp(chunk + 800L, 5_120 * ms) // frame 1600 at 5070 ms: 70 ms after the write
    assertEquals(70.0, clock.startLatency, 0.01)
  }

  @Test
  fun `a drained track's timestamp does not measure and the next burst still does`() {
    val clock = PlaybackClock(rate)
    clock.onWrite(chunk, 1_000 * ms)
    // First polled 30 s later: the last frame, "presented" at the poll's own time.
    clock.onTimestamp(chunk.toLong(), 31_000 * ms)
    assertFalse(clock.isMeasured)
    clock.onWrite(chunk, 40_000 * ms)
    clock.onTimestamp(chunk + 800L, 40_125 * ms) // frame 1600 at 40075 ms: 75 ms after the write
    assertTrue(clock.isMeasured)
    assertEquals(75.0, clock.startLatency, 0.01)
  }

  @Test
  fun `a chunk behind queued audio is audible when the frames ahead of it have played`() {
    val clock = PlaybackClock(rate)
    clock.onWrite(chunk, 0)
    clock.onTimestamp(0, 80 * ms)
    clock.onWrite(chunk, 1 * ms)
    clock.onWrite(chunk, 2 * ms)
    // At 130 ms, 50 ms of 300 ms written have played: 250 ms ahead, plus 100 ms still in the
    // engine's own queue.
    assertEquals(250.0, clock.audibleInMs(130 * ms, 0)!!, 0.01)
    assertEquals(350.0, clock.audibleInMs(130 * ms, chunk.toLong())!!, 0.01)
  }

  @Test
  fun `a drained track starts the next chunk after the start latency`() {
    val clock = PlaybackClock(rate)
    clock.onWrite(chunk, 1_000 * ms)
    clock.onTimestamp(800, 1_120 * ms) // start latency 70 ms
    // Long after the 100 ms chunk played out: nothing ahead, so the start latency applies.
    assertEquals(70.0, clock.audibleInMs(5_000 * ms, 0)!!, 0.01)
    // And the next write after the gap is measured again.
    clock.onWrite(chunk, 5_000 * ms)
    clock.onTimestamp(chunk + 160L, 5_100 * ms) // frame 1600 at 5090 ms: 90 ms after the write
    assertEquals(90.0, clock.startLatency, 0.01)
  }

  @Test
  fun `a flush starts positions again and drops the old timestamp`() {
    val clock = PlaybackClock(rate)
    clock.onWrite(chunk, 0)
    clock.onTimestamp(400, 80 * ms)
    clock.reset()
    assertEquals(0L, clock.framesWritten)
    assertNull(clock.audibleInMs(100 * ms, 0))
  }

  @Test
  fun `a timestamp past the written frames or an absurd latency is ignored`() {
    val clock = PlaybackClock(rate)
    clock.onWrite(chunk, 1_000 * ms)
    clock.onTimestamp(chunk + 1L, 1_200 * ms)
    assertNull(clock.audibleInMs(1_200 * ms, 0))
    clock.onTimestamp(0, 5_000 * ms) // 4 s after the write: a stale clock, not a latency
    assertFalse(clock.isMeasured)
    assertEquals(PlaybackClock.DEFAULT_START_LATENCY_MS, clock.startLatency, 0.0)
  }
}
