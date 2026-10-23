package com.hizuri.floating

import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToLong
import kotlin.math.sign
import kotlin.math.sqrt

/**
 * Where the assistant's window may stand, in screen pixels, for a window placed by its top-left
 * corner (gravity TOP|LEFT). The floor is the bottom of the usable screen: its feet stand on the
 * navigation bar, never under it.
 */
data class FloatBounds(
  val screenWidth: Int,
  val screenHeight: Int,
  val topInset: Int,
  val bottomInset: Int,
  val width: Int,
  val height: Int,
) {
  val maxX: Int get() = max(0, screenWidth - width)
  val floorY: Int get() = max(0, screenHeight - bottomInset - height)
  val ceilingY: Int get() = min(topInset, floorY)

  fun clampX(x: Int): Int = x.coerceIn(0, maxX)

  fun clampY(y: Int): Int = y.coerceIn(ceilingY, floorY)

  fun onFloor(y: Int): Boolean = y >= floorY - 1
}

object FloatMotion {
  /** Time to fall `distancePx` from rest under constant acceleration: t = sqrt(2d / g). */
  fun fallMs(distancePx: Int, gravityPxPerS2: Double): Long {
    if (distancePx <= 0 || gravityPxPerS2 <= 0) return 0
    return (sqrt(2.0 * distancePx / gravityPxPerS2) * 1000).roundToLong()
  }

  /** Where a walk of `distancePx` toward `direction` (-1 left, 1 right) ends: at an edge at most. */
  fun walkTarget(bounds: FloatBounds, x: Int, direction: Int, distancePx: Int): Int =
    bounds.clampX(x + direction.sign * abs(distancePx))

  fun walkMs(fromX: Int, toX: Int, speedPxPerS: Double): Long {
    if (speedPxPerS <= 0) return 0
    return (abs(toX - fromX) / speedPxPerS * 1000).roundToLong()
  }
}
