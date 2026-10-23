package com.hizuri.floating

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.TimeInterpolator
import android.animation.ValueAnimator
import android.app.Activity
import android.app.Application
import android.app.KeyguardManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.content.res.Configuration
import android.graphics.PixelFormat
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.util.Log
import android.view.Gravity
import android.view.ViewGroup
import android.view.WindowInsets
import android.view.WindowManager
import android.view.animation.AccelerateInterpolator
import android.view.animation.LinearInterpolator
import android.widget.FrameLayout
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.facebook.react.ReactApplication
import com.facebook.react.fabric.FabricUIManager
import com.facebook.react.interfaces.fabric.ReactSurface
import com.facebook.react.uimanager.UIManagerHelper
import com.facebook.react.uimanager.common.UIManagerType
import kotlin.math.roundToInt

/**
 * Floating assistant: one small window over every app (TYPE_APPLICATION_OVERLAY), holding a second
 * React surface of the app's own React host, so the component inside (`HizuriFloat`, registered in
 * packages/app/src/float/) runs in the same JS as the app and gets the same voice and state. The
 * window is only as big as the avatar's body: Android 12+ blocks touches that pass through a
 * covering overlay, so everything outside it stays the app below.
 *
 * The service is started while the app is on screen and stays until it is turned off, the app
 * is swiped away or the process dies. It is a foreground service (type specialUse) only while
 * no voice session keeps the process alive; JS switches that with setForeground. Promoting it
 * from the background is allowed because the app holds SYSTEM_ALERT_WINDOW and (Android 15+)
 * its window is visible.
 *
 * The window, its layout parameters and the second surface are adapted from
 * react-native-android-overlay's OverlayService (MIT, see LICENSE-react-native-android-overlay).
 */
class FloatService : Service(), FloatWindowView.Listener {
  companion object {
    private const val TAG = "HizuriFloat"
    /** The component registered with AppRegistry.registerComponent in JS. */
    const val SURFACE = "HizuriFloat"
    private const val ACTION_STOP = "com.hizuri.floating.STOP"
    private const val EXTRA_WIDTH = "widthDp"
    private const val EXTRA_HEIGHT = "heightDp"
    private const val EXTRA_FOREGROUND = "foreground"
    private const val EXTRA_TITLE = "title"
    private const val EXTRA_TEXT = "text"
    private const val CHANNEL_ID = "hizuri-float"
    private const val NOTIFICATION_ID = 4107
    /**
     * Fall acceleration, in dp per second squared: a drop from mid-screen takes about half a
     * second.
     */
    private const val GRAVITY_DP = 4000.0
    private const val EDGE_MARGIN_DP = 4
    /**
     * After the unlock, how long the app gets to come on screen (and hide the overlay) before it
     * shows.
     */
    private const val AWAKE_SHOW_DELAY_MS = 600L

    @Volatile var instance: FloatService? = null
      private set

    fun start(
      context: Context,
      widthDp: Double,
      heightDp: Double,
      foreground: Boolean,
      title: String,
      text: String,
    ): Boolean {
      val intent = Intent(context, FloatService::class.java)
        .putExtra(EXTRA_WIDTH, widthDp)
        .putExtra(EXTRA_HEIGHT, heightDp)
        .putExtra(EXTRA_FOREGROUND, foreground)
        .putExtra(EXTRA_TITLE, title)
        .putExtra(EXTRA_TEXT, text)
      return try {
        if (foreground) ContextCompat.startForegroundService(context, intent) else context.startService(intent)
        true
      } catch (e: IllegalStateException) {
        // ForegroundServiceStartNotAllowedException (API 31+) extends IllegalStateException.
        Log.w(TAG, "Float service start refused", e)
        false
      }
    }
  }

  private val main = Handler(Looper.getMainLooper())
  private lateinit var windowManager: WindowManager
  private var root: FloatWindowView? = null
  private var surface: ReactSurface? = null
  private var params: WindowManager.LayoutParams? = null
  private var widthDp = 150.0
  private var heightDp = 290.0
  private var title = "hizuri"
  private var text = "Zuri is on your screen"
  private var savedX: Int? = null
  private var savedY: Int? = null
  private var dragFromX = 0
  private var dragFromY = 0
  private var animator: ValueAnimator? = null
  private var isForeground = false
  private var lifecycle: Application.ActivityLifecycleCallbacks? = null
  /**
   * Asked to show while the screen was off: it shows once the user is back, unless hidden
   * meanwhile.
   */
  private var showWhenAwake = false
  private val density: Float
    get() = resources.displayMetrics.density

  val isShown: Boolean
    get() = root != null

  private val screenReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
      when (intent.action) {
        Intent.ACTION_SCREEN_OFF -> FloatBus.send("screenOff")
        Intent.ACTION_SCREEN_ON -> {
          FloatBus.send("screenOn")
          val keyguard = getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
          if (!keyguard.isKeyguardLocked) showOnceAwake()
        }
        Intent.ACTION_USER_PRESENT -> showOnceAwake()
      }
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    instance = this
    windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
    // React Native pauses its UI-operation dispatch when the app's activity pauses; the overlay's
    // surface would then never get mouth frames. Resume only that dispatch (not the host: a resumed
    // host would tell JS the app is "active").
    lifecycle = object : Application.ActivityLifecycleCallbacks {
      override fun onActivityPaused(activity: Activity) {
        main.postDelayed({ keepMounting() }, 150)
      }
      override fun onActivityStopped(activity: Activity) {
        main.postDelayed({ keepMounting() }, 150)
      }
      override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) {}
      override fun onActivityStarted(activity: Activity) {}
      override fun onActivityResumed(activity: Activity) {}
      override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) {}
      override fun onActivityDestroyed(activity: Activity) {}
    }
    application.registerActivityLifecycleCallbacks(lifecycle)
    val filter = IntentFilter().apply {
      addAction(Intent.ACTION_SCREEN_OFF)
      addAction(Intent.ACTION_SCREEN_ON)
      addAction(Intent.ACTION_USER_PRESENT)
    }
    ContextCompat.registerReceiver(this, screenReceiver, filter, ContextCompat.RECEIVER_NOT_EXPORTED)
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      FloatBus.send("stopped", mapOf("reason" to "notification"))
      stopSelf()
      return START_NOT_STICKY
    }
    if (intent != null) {
      widthDp = intent.getDoubleExtra(EXTRA_WIDTH, widthDp)
      heightDp = intent.getDoubleExtra(EXTRA_HEIGHT, heightDp)
      title = intent.getStringExtra(EXTRA_TITLE) ?: title
      text = intent.getStringExtra(EXTRA_TEXT) ?: text
      if (intent.getBooleanExtra(EXTRA_FOREGROUND, false)) goForeground()
    }
    FloatBus.send("started", mapOf("foreground" to isForeground))
    // Without the app's JS there is nothing to show: never restarted by the system.
    return START_NOT_STICKY
  }

  fun setForeground(on: Boolean) = main.post {
    if (on == isForeground) return@post
    if (on) {
      goForeground()
    } else {
      stopForeground(STOP_FOREGROUND_REMOVE)
      isForeground = false
    }
    FloatBus.send("foreground", mapOf("foreground" to isForeground))
  }

  private fun goForeground(): Boolean {
    return try {
      val notification = buildNotification()
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
        startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
      } else {
        startForeground(NOTIFICATION_ID, notification)
      }
      isForeground = true
      true
    } catch (e: Exception) {
      // ForegroundServiceStartNotAllowedException: hidden app, no visible overlay window.
      Log.w(TAG, "Foreground refused", e)
      FloatBus.send("foregroundRefused", mapOf("message" to (e.message ?: e.javaClass.simpleName)))
      false
    }
  }

  fun show(widthDp: Double, heightDp: Double) = main.post {
    this.widthDp = widthDp
    this.heightDp = heightDp
    if (root != null) {
      resize()
      return@post
    }
    // The screen going off sends the app to the background, which asks for the overlay window: a
    // page made in the dark would load and draw unseen (it pauses only when the screen goes off).
    if (!(getSystemService(Context.POWER_SERVICE) as PowerManager).isInteractive) {
      showWhenAwake = true
      return@post
    }
    val host = (application as? ReactApplication)?.reactHost
    if (host == null) {
      Log.w(TAG, "No React host: the window stays hidden")
      return@post
    }
    val next = host.createSurface(this, SURFACE, null)
    val surfaceView = next.view
    if (surfaceView == null) {
      Log.w(TAG, "The surface has no view: the window stays hidden")
      return@post
    }
    next.start()
    val view = FloatWindowView(this, this)
    view.addView(
      surfaceView,
      FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT),
    )
    val bounds = bounds()
    val layout = WindowManager.LayoutParams(
      bounds.width,
      bounds.height,
      WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
      // Not focusable: the keyboard, Back and every touch outside the overlay go to the app below.
      // Hardware accelerated: a window added from a service is not by default, and WebGL needs it.
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
        WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS or
        WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
        WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED,
      PixelFormat.TRANSLUCENT,
    ).apply {
      gravity = Gravity.TOP or Gravity.START
      x = savedX?.let(bounds::clampX) ?: (bounds.maxX - (EDGE_MARGIN_DP * density).roundToInt()).coerceAtLeast(0)
      y = savedY?.let(bounds::clampY) ?: bounds.floorY
      setTitle("hizuri float")
    }
    try {
      windowManager.addView(view, layout)
    } catch (e: Exception) {
      Log.e(TAG, "Could not add the window", e)
      next.stop()
      FloatBus.send("error", mapOf("message" to (e.message ?: "addView failed")))
      return@post
    }
    surface = next
    root = view
    params = layout
    keepMounting()
    FloatBus.send("shown", position())
    if (!bounds.onFloor(layout.y)) fall()
  }

  /** Removes the window and its surface (the WebView goes with it); the service stays. */
  fun hide() = main.post {
    showWhenAwake = false
    removeWindow()
  }

  private fun showOnceAwake() {
    if (!showWhenAwake) return
    main.postDelayed({
      if (showWhenAwake) {
        showWhenAwake = false
        show(widthDp, heightDp)
      }
    }, AWAKE_SHOW_DELAY_MS)
  }

  private fun removeWindow() {
    stopAnimation()
    val view = root ?: return
    params?.let {
      savedX = it.x
      savedY = it.y
    }
    try {
      view.removeAllViews()
      windowManager.removeView(view)
    } catch (e: Exception) {
      Log.w(TAG, "Could not remove the window", e)
    }
    surface?.stop()
    surface = null
    root = null
    params = null
    FloatBus.send("hidden")
  }

  /** Walks `distanceDp` toward `direction` (-1 left, 1 right) at `speedDp` per second. */
  fun walk(direction: Int, distanceDp: Double, speedDp: Double) = main.post {
    val layout = params ?: return@post
    stopAnimation()
    val bounds = bounds()
    val target = FloatMotion.walkTarget(bounds, layout.x, direction, (distanceDp * density).roundToInt())
    val ms = FloatMotion.walkMs(layout.x, target, speedDp * density)
    if (ms <= 0) {
      FloatBus.send("walkEnd", position() + mapOf("moved" to false))
      return@post
    }
    FloatBus.send("walkStart", position() + mapOf("ms" to ms, "direction" to direction))
    animate(layout.x, target, ms, LinearInterpolator(), { layout.x = it }) { finished ->
      FloatBus.send("walkEnd", position() + mapOf("moved" to true, "finished" to finished))
    }
  }

  fun stopWalk() = main.post { stopAnimation() }

  /** Current position, as a `position` event (the component asks once it mounts). */
  fun emitPosition() = main.post {
    if (params != null) FloatBus.send("position", position())
  }

  fun openApp(): Boolean {
    val intent = packageManager.getLaunchIntentForPackage(packageName) ?: return false
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
    return try {
      // Allowed from the background: the app holds SYSTEM_ALERT_WINDOW.
      startActivity(intent)
      true
    } catch (e: Exception) {
      Log.w(TAG, "Could not open the app", e)
      false
    }
  }

  // FloatWindowView.Listener: the finger owns the avatar while it is down.

  override fun onGrab() {
    stopAnimation()
  }

  override fun onDragStart() {
    val layout = params ?: return
    dragFromX = layout.x
    dragFromY = layout.y
    FloatBus.send("dragStart", position())
  }

  override fun onDrag(dxPx: Int, dyPx: Int) {
    val layout = params ?: return
    val bounds = bounds()
    layout.x = bounds.clampX(dragFromX + dxPx)
    layout.y = bounds.clampY(dragFromY + dyPx)
    update()
  }

  override fun onRelease() {
    FloatBus.send("release", position())
    fall()
  }

  override fun onTap(xDp: Double, yDp: Double) {
    FloatBus.send("tap", position() + mapOf("tapX" to xDp, "tapY" to yDp))
  }

  override fun onLongPress() {
    FloatBus.send("longPress", position())
  }

  /** Released above the floor, the avatar drops to it like a thing let go. */
  private fun fall() {
    val layout = params ?: return
    val bounds = bounds()
    val distance = bounds.floorY - layout.y
    if (distance <= 0) {
      FloatBus.send("landed", position())
      return
    }
    val ms = FloatMotion.fallMs(distance, GRAVITY_DP * density)
    FloatBus.send("fall", position() + mapOf("ms" to ms))
    animate(layout.y, bounds.floorY, ms, AccelerateInterpolator(1f), { layout.y = it }) {
      FloatBus.send("landed", position())
    }
  }

  private fun animate(
    from: Int,
    to: Int,
    ms: Long,
    interpolator: TimeInterpolator,
    apply: (Int) -> Unit,
    done: (finished: Boolean) -> Unit,
  ) {
    val next = ValueAnimator.ofInt(from, to).apply {
      duration = ms
      this.interpolator = interpolator
      addUpdateListener {
        apply(it.animatedValue as Int)
        update()
      }
      addListener(object : AnimatorListenerAdapter() {
        private var cancelled = false
        override fun onAnimationCancel(animation: Animator) {
          cancelled = true
        }
        override fun onAnimationEnd(animation: Animator) {
          if (animator === animation) animator = null
          done(!cancelled)
        }
      })
    }
    animator = next
    next.start()
  }

  private fun stopAnimation() {
    animator?.cancel()
    animator = null
  }

  private fun update() {
    val view = root ?: return
    val layout = params ?: return
    try {
      windowManager.updateViewLayout(view, layout)
    } catch (e: IllegalArgumentException) {
      // The window was removed between two frames.
    }
  }

  private fun resize() {
    val layout = params ?: return
    val bounds = bounds()
    val wasOnFloor = bounds().copy(width = layout.width, height = layout.height).onFloor(layout.y)
    layout.width = bounds.width
    layout.height = bounds.height
    layout.x = bounds.clampX(layout.x)
    layout.y = if (wasOnFloor) bounds.floorY else bounds.clampY(layout.y)
    update()
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    // A turn of the screen: keep the avatar inside it and on the floor if it stood on it.
    main.postDelayed({ resize() }, 300)
  }

  private fun bounds(): FloatBounds {
    val width = (widthDp * density).roundToInt()
    val height = (heightDp * density).roundToInt()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      val metrics = windowManager.currentWindowMetrics
      val insets = metrics.windowInsets.getInsetsIgnoringVisibility(
        WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout(),
      )
      return FloatBounds(metrics.bounds.width(), metrics.bounds.height(), insets.top, insets.bottom, width, height)
    }
    val display = resources.displayMetrics
    return FloatBounds(display.widthPixels, display.heightPixels, 0, 0, width, height)
  }

  private fun position(): Map<String, Any?> {
    val layout = params ?: return emptyMap()
    val bounds = bounds()
    return mapOf(
      "x" to layout.x / density.toDouble(),
      "y" to layout.y / density.toDouble(),
      "screenWidth" to bounds.screenWidth / density.toDouble(),
      "onFloor" to bounds.onFloor(layout.y),
      "atLeft" to (layout.x <= 0),
      "atRight" to (layout.x >= bounds.maxX),
    )
  }

  private fun keepMounting() {
    if (root == null) return
    val context = (application as? ReactApplication)?.reactHost?.currentReactContext ?: return
    (UIManagerHelper.getUIManager(context, UIManagerType.FABRIC) as? FabricUIManager)?.onHostResume()
  }

  private fun buildNotification(): Notification {
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (manager.getNotificationChannel(CHANNEL_ID) == null) {
      val channel = NotificationChannel(CHANNEL_ID, "Floating Zuri", NotificationManager.IMPORTANCE_MIN)
      channel.description = "Shown while Zuri floats over other apps"
      channel.setShowBadge(false)
      manager.createNotificationChannel(channel)
    }
    val open = packageManager.getLaunchIntentForPackage(packageName)?.let {
      PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }
    val stop = PendingIntent.getService(
      this,
      1,
      Intent(this, FloatService::class.java).setAction(ACTION_STOP),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle(title)
      .setContentText(text)
      .setSmallIcon(android.R.drawable.ic_menu_view)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setSilent(true)
      .setCategory(NotificationCompat.CATEGORY_SERVICE)
      .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
      .addAction(0, "Hide", stop)
      .apply { open?.let { setContentIntent(it) } }
      .build()
  }

  override fun onTaskRemoved(rootIntent: Intent?) {
    // Swiped away from Recents: the overlay goes with the app.
    FloatBus.send("stopped", mapOf("reason" to "task-removed"))
    stopSelf()
    super.onTaskRemoved(rootIntent)
  }

  override fun onDestroy() {
    removeWindow()
    lifecycle?.let { application.unregisterActivityLifecycleCallbacks(it) }
    lifecycle = null
    try {
      unregisterReceiver(screenReceiver)
    } catch (e: IllegalArgumentException) {
      // Never registered.
    }
    if (isForeground) stopForeground(STOP_FOREGROUND_REMOVE)
    isForeground = false
    instance = null
    FloatBus.send("stopped")
    super.onDestroy()
  }
}
