package com.hizuri.floating

import android.annotation.SuppressLint
import android.content.Context
import android.view.HapticFeedbackConstants
import android.view.MotionEvent
import android.view.ViewConfiguration
import android.widget.FrameLayout
import kotlin.math.abs
import kotlin.math.roundToInt

/**
 * The window's root: the assistant's React surface inside, and the touch rules around it. A finger
 * that moves past the touch slop drags the window (the children get a cancel and see no more of
 * that gesture); a tap and a long press are reported and still reach the children, so the buttons
 * of its long-press menu work. Drag handling adapted from react-native-android-overlay's
 * OverlayContainerView (MIT, see LICENSE-react-native-android-overlay).
 */
@SuppressLint("ViewConstructor")
class FloatWindowView(context: Context, private val listener: Listener) : FrameLayout(context) {
  interface Listener {
    fun onGrab()
    fun onDragStart()
    fun onDrag(dxPx: Int, dyPx: Int)
    fun onRelease()
    fun onTap(xDp: Double, yDp: Double)
    fun onLongPress()
  }

  private val touchSlop = ViewConfiguration.get(context).scaledTouchSlop
  private val longPressMs = ViewConfiguration.getLongPressTimeout().toLong()
  private val density = resources.displayMetrics.density
  private var downRawX = 0f
  private var downRawY = 0f
  private var dragging = false
  private var longPressed = false
  private val longPress = Runnable {
    if (dragging) return@Runnable
    longPressed = true
    performHapticFeedback(HapticFeedbackConstants.LONG_PRESS)
    listener.onLongPress()
  }

  override fun dispatchTouchEvent(event: MotionEvent): Boolean {
    when (event.actionMasked) {
      MotionEvent.ACTION_DOWN -> {
        downRawX = event.rawX
        downRawY = event.rawY
        dragging = false
        longPressed = false
        postDelayed(longPress, longPressMs)
        listener.onGrab()
      }
      MotionEvent.ACTION_MOVE -> {
        val dx = event.rawX - downRawX
        val dy = event.rawY - downRawY
        if (!dragging && (abs(dx) > touchSlop || abs(dy) > touchSlop)) {
          dragging = true
          removeCallbacks(longPress)
          cancelChildren(event)
          listener.onDragStart()
        }
        if (dragging) {
          listener.onDrag(dx.roundToInt(), dy.roundToInt())
          return true
        }
      }
      MotionEvent.ACTION_UP -> {
        removeCallbacks(longPress)
        if (dragging) {
          dragging = false
          listener.onRelease()
          return true
        }
        if (!longPressed) listener.onTap((event.x / density).toDouble(), (event.y / density).toDouble())
      }
      MotionEvent.ACTION_CANCEL -> {
        removeCallbacks(longPress)
        if (dragging) {
          dragging = false
          listener.onRelease()
          return true
        }
      }
    }
    super.dispatchTouchEvent(event)
    return true
  }

  private fun cancelChildren(event: MotionEvent) {
    val cancel = MotionEvent.obtain(event)
    cancel.action = MotionEvent.ACTION_CANCEL
    super.dispatchTouchEvent(cancel)
    cancel.recycle()
  }

  override fun onDetachedFromWindow() {
    removeCallbacks(longPress)
    super.onDetachedFromWindow()
  }
}
