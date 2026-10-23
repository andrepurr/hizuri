package com.hizuri.floating

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class FloatGeometryTest {
  // A 1080×2400 phone with a 63 px status bar and a 126 px navigation bar, the assistant's window
  // 420×812.
  private val phone = FloatBounds(1080, 2400, 63, 126, 420, 812)

  @Test
  fun `the floor is the top of the navigation bar minus the assistant's height`() {
    assertEquals(2400 - 126 - 812, phone.floorY)
    assertTrue(phone.onFloor(phone.floorY))
    assertFalse(phone.onFloor(phone.floorY - 10))
  }

  @Test
  fun `a drag keeps the whole window on the screen`() {
    assertEquals(0, phone.clampX(-300))
    assertEquals(1080 - 420, phone.clampX(5000))
    assertEquals(63, phone.clampY(-50))
    assertEquals(phone.floorY, phone.clampY(9000))
  }

  @Test
  fun `a window taller than the screen stands at the top`() {
    val tiny = FloatBounds(400, 600, 20, 40, 500, 800)
    assertEquals(0, tiny.maxX)
    assertEquals(0, tiny.floorY)
    assertEquals(0, tiny.clampY(30))
  }

  @Test
  fun `the fall time follows constant acceleration`() {
    // d = g t² / 2: 2000 px at 8000 px/s² takes sqrt(0.5) s.
    assertEquals(707, FloatMotion.fallMs(2000, 8000.0))
    assertEquals(0, FloatMotion.fallMs(0, 8000.0))
    assertEquals(0, FloatMotion.fallMs(-5, 8000.0))
  }

  @Test
  fun `a walk stops at the edge`() {
    assertEquals(500, FloatMotion.walkTarget(phone, 200, 1, 300))
    assertEquals(phone.maxX, FloatMotion.walkTarget(phone, 600, 1, 300))
    assertEquals(0, FloatMotion.walkTarget(phone, 100, -1, 300))
    assertEquals(0, FloatMotion.walkTarget(phone, 0, -1, 300))
  }

  @Test
  fun `the walk time is distance over speed`() {
    assertEquals(1500, FloatMotion.walkMs(0, 300, 200.0))
    assertEquals(1500, FloatMotion.walkMs(300, 0, 200.0))
    assertEquals(0, FloatMotion.walkMs(0, 0, 200.0))
    assertEquals(0, FloatMotion.walkMs(0, 300, 0.0))
  }
}
