package com.maindy.nativemodule.floating

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.PropertyValuesHolder
import android.animation.ValueAnimator
import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.ServiceInfo
import android.content.res.Configuration
import android.graphics.PixelFormat
import android.graphics.Rect
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.provider.Settings
import android.util.Log
import android.view.Gravity
import android.view.HapticFeedbackConstants
import android.view.MotionEvent
import android.view.ViewConfiguration
import android.view.WindowInsets
import android.view.WindowManager
import android.view.animation.OvershootInterpolator
import androidx.core.app.NotificationCompat
import com.maindy.nativemodule.MaindyDeepLinks
import com.maindy.nativemodule.MaindyEvents
import com.maindy.nativemodule.R
import java.lang.ref.WeakReference
import kotlin.math.hypot
import kotlin.math.roundToInt

/**
 * Foreground service that owns MAINDY's floating orb overlay.
 *
 * - Only runs after the user granted "Display over other apps" (checked again on every start).
 * - Shows a persistent notification with a "Remover" action, so the user can always remove it.
 * - The orb can also be removed by dragging it onto the bottom dismiss target.
 * - Never restarts itself (START_NOT_STICKY): if the system kills it, it stays gone until the
 *   user turns it on again from the app.
 */
class FloatingAgentService : Service() {

  companion object {
    const val ACTION_SHOW = "com.maindy.nativemodule.floating.SHOW"
    const val ACTION_REMOVE = "com.maindy.nativemodule.floating.REMOVE"
    const val EXTRA_SIZE_DP = "sizeDp"
    const val EXTRA_X_DP = "xDp"
    const val EXTRA_Y_DP = "yDp"

    private const val CHANNEL_ID = "maindy_floating_agent"
    private const val NOTIFICATION_ID = 0x4D41
    private const val PREFS = "maindy_floating_agent"
    private const val DEFAULT_SIZE_DP = 64f
    private const val MIN_SIZE_DP = 40f
    private const val MAX_SIZE_DP = 120f
    private const val DISMISS_TARGET_DP = 76f
    private const val DISMISS_TARGET_MARGIN_DP = 48f

    @Volatile
    var isShowing: Boolean = false
      private set

    @Volatile
    private var instance: WeakReference<FloatingAgentService>? = null

    fun buildShowIntent(context: Context, sizeDp: Double?, xDp: Double?, yDp: Double?): Intent =
      Intent(context, FloatingAgentService::class.java).apply {
        action = ACTION_SHOW
        sizeDp?.let { putExtra(EXTRA_SIZE_DP, it.toFloat()) }
        xDp?.let { putExtra(EXTRA_X_DP, it.toFloat()) }
        yDp?.let { putExtra(EXTRA_Y_DP, it.toFloat()) }
      }

    /** Removes the orb (called from JS `FloatingAgent.hide()`). */
    fun hide(context: Context) {
      val running = instance?.get()
      if (running != null) {
        running.mainHandler.post { running.dismiss("app") }
      } else {
        context.stopService(Intent(context, FloatingAgentService::class.java))
      }
    }

    /** Lets the JS app reflect its own voice state on the orb glow. */
    fun setListening(listening: Boolean): Boolean {
      val running = instance?.get() ?: return false
      running.mainHandler.post { running.applyListening(listening) }
      return true
    }
  }

  private val mainHandler = Handler(Looper.getMainLooper())
  private lateinit var windowManager: WindowManager
  private lateinit var prefs: SharedPreferences

  private var orb: FloatingOrbView? = null
  private var orbParams: WindowManager.LayoutParams? = null
  private var dismissTarget: DismissTargetView? = null
  private var dismissParams: WindowManager.LayoutParams? = null

  private var startedForeground = false
  private var dismissReason = "system"
  private var externallyListening = false

  // Touch state
  private var downRawX = 0f
  private var downRawY = 0f
  private var startX = 0
  private var startY = 0
  private var dragging = false
  private var longPressed = false
  private var snapAnimator: ValueAnimator? = null
  private val touchSlop by lazy { ViewConfiguration.get(this).scaledTouchSlop }
  private val longPressRunnable = Runnable { onLongPress() }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
    prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    instance = WeakReference(this)
    createNotificationChannel()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_REMOVE) {
      // Sent by the notification's "Remover" action.
      if (!startedForeground) {
        stopSelf()
      } else {
        dismiss("notification")
      }
      return START_NOT_STICKY
    }

    // We were started with startForegroundService(): promote to foreground right away.
    if (!startedForeground) {
      try {
        startInForeground()
      } catch (t: Throwable) {
        Log.w(MaindyEvents.TAG, "Could not start floating agent in foreground", t)
        dismissReason = "error"
        stopSelf()
        return START_NOT_STICKY
      }
    }

    if (!Settings.canDrawOverlays(this)) {
      // Permission was revoked (or never granted). Never try to work around it.
      dismissReason = "permission_missing"
      stopSelf()
      return START_NOT_STICKY
    }

    showOrUpdate(intent)
    return START_NOT_STICKY
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    if (orb != null) mainHandler.post { snapToEdge(emitMoved = false) }
  }

  override fun onDestroy() {
    mainHandler.removeCallbacks(longPressRunnable)
    snapAnimator?.cancel()
    removeDismissTarget()
    orb?.let { view ->
      try {
        windowManager.removeView(view)
      } catch (_: Throwable) {
      }
    }
    orb = null
    orbParams = null
    val wasShowing = isShowing
    isShowing = false
    if (instance?.get() === this) instance = null
    if (wasShowing || dismissReason != "system") {
      MaindyEvents.emit(MaindyEvents.FLOATING_DISMISSED, mapOf("reason" to dismissReason))
    }
    super.onDestroy()
  }

  // region Foreground notification

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (manager.getNotificationChannel(CHANNEL_ID) != null) return
    val channel = NotificationChannel(
      CHANNEL_ID,
      getString(R.string.maindy_floating_channel_name),
      NotificationManager.IMPORTANCE_LOW
    ).apply {
      description = getString(R.string.maindy_floating_channel_description)
      setShowBadge(false)
    }
    manager.createNotificationChannel(channel)
  }

  private fun buildNotification(): Notification {
    val immutable = PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    val openIntent = Intent(Intent.ACTION_VIEW, Uri.parse(MaindyDeepLinks.ASSISTANT)).apply {
      setPackage(packageName)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    }
    val openPending = PendingIntent.getActivity(this, 0, openIntent, immutable)
    val removeIntent = Intent(this, FloatingAgentService::class.java).setAction(ACTION_REMOVE)
    val removePending = PendingIntent.getService(this, 1, removeIntent, immutable)

    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(R.drawable.maindy_ic_notification)
      .setColor(BrandColors.PURPLE)
      .setContentTitle(getString(R.string.maindy_floating_notification_title))
      .setContentText(getString(R.string.maindy_floating_notification_text))
      .setContentIntent(openPending)
      .addAction(0, getString(R.string.maindy_floating_notification_remove), removePending)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setShowWhen(false)
      .setCategory(NotificationCompat.CATEGORY_SERVICE)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
      .build()
  }

  private fun startInForeground() {
    val notification = buildNotification()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
    startedForeground = true
  }

  // endregion

  // region Overlay windows

  private fun overlayType(): Int =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
    } else {
      @Suppress("DEPRECATION")
      WindowManager.LayoutParams.TYPE_PHONE
    }

  private fun dp(value: Float): Int = (value * resources.displayMetrics.density).roundToInt()

  private fun toDp(px: Int): Double = (px / resources.displayMetrics.density).toDouble()

  /** Usable area for the orb, in screen pixels (excludes status/navigation bars and cutouts). */
  private fun usableBounds(): Rect {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      val metrics = windowManager.currentWindowMetrics
      val insets = metrics.windowInsets.getInsetsIgnoringVisibility(
        WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout()
      )
      val b = metrics.bounds
      return Rect(b.left + insets.left, b.top + insets.top, b.right - insets.right, b.bottom - insets.bottom)
    }
    val dm = resources.displayMetrics
    @SuppressLint("InternalInsetResource", "DiscouragedApi")
    val statusBarId = resources.getIdentifier("status_bar_height", "dimen", "android")
    val statusBar = if (statusBarId > 0) resources.getDimensionPixelSize(statusBarId) else 0
    return Rect(0, statusBar, dm.widthPixels, dm.heightPixels)
  }

  private fun showOrUpdate(intent: Intent?) {
    val sizeDp = (intent?.takeIf { it.hasExtra(EXTRA_SIZE_DP) }?.getFloatExtra(EXTRA_SIZE_DP, DEFAULT_SIZE_DP)
      ?: prefs.getFloat("sizeDp", DEFAULT_SIZE_DP)).coerceIn(MIN_SIZE_DP, MAX_SIZE_DP)
    val sizePx = dp(sizeDp)
    val bounds = usableBounds()

    val xPx = intent?.takeIf { it.hasExtra(EXTRA_X_DP) }?.let { dp(it.getFloatExtra(EXTRA_X_DP, 0f)) }
      ?: prefs.takeIf { it.contains("xDp") }?.let { dp(it.getFloat("xDp", 0f)) }
      ?: (bounds.right - sizePx)
    val yPx = intent?.takeIf { it.hasExtra(EXTRA_Y_DP) }?.let { dp(it.getFloatExtra(EXTRA_Y_DP, 0f)) }
      ?: prefs.takeIf { it.contains("yDp") }?.let { dp(it.getFloat("yDp", 0f)) }
      ?: (bounds.top + bounds.height() / 3)

    prefs.edit().putFloat("sizeDp", sizeDp).apply()

    val existing = orb
    val params = orbParams
    if (existing != null && params != null) {
      params.width = sizePx
      params.height = sizePx
      params.x = xPx.coerceIn(bounds.left, maxOf(bounds.left, bounds.right - sizePx))
      params.y = yPx.coerceIn(bounds.top, maxOf(bounds.top, bounds.bottom - sizePx))
      safeUpdate(existing, params)
      return
    }

    val view = FloatingOrbView(this)
    val newParams = WindowManager.LayoutParams(
      sizePx,
      sizePx,
      overlayType(),
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
      PixelFormat.TRANSLUCENT
    ).apply {
      gravity = Gravity.TOP or Gravity.START
      x = xPx.coerceIn(bounds.left, maxOf(bounds.left, bounds.right - sizePx))
      y = yPx.coerceIn(bounds.top, maxOf(bounds.top, bounds.bottom - sizePx))
      title = "MAINDY floating agent"
    }
    attachTouchHandling(view)
    view.contentDescription = "MAINDY"
    try {
      windowManager.addView(view, newParams)
    } catch (t: Throwable) {
      Log.w(MaindyEvents.TAG, "Could not add the floating agent window", t)
      dismissReason = "error"
      stopSelf()
      return
    }
    orb = view
    orbParams = newParams
    isShowing = true
    if (externallyListening) view.state = FloatingOrbView.State.LISTENING
  }

  private fun safeUpdate(view: android.view.View, params: WindowManager.LayoutParams) {
    try {
      if (view.isAttachedToWindow) windowManager.updateViewLayout(view, params)
    } catch (t: Throwable) {
      Log.w(MaindyEvents.TAG, "updateViewLayout failed", t)
    }
  }

  private fun showDismissTarget() {
    if (dismissTarget != null) return
    val size = dp(DISMISS_TARGET_DP)
    val view = DismissTargetView(this)
    val params = WindowManager.LayoutParams(
      size,
      size,
      overlayType(),
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
        WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or
        WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
      PixelFormat.TRANSLUCENT
    ).apply {
      gravity = Gravity.TOP or Gravity.START
      val bounds = usableBounds()
      x = bounds.centerX() - size / 2
      y = bounds.bottom - size - dp(DISMISS_TARGET_MARGIN_DP)
      // Non-touchable overlays must stay at or below 0.8 opacity so touches on the app below are
      // not blocked by Android 12+'s untrusted-touch occlusion rules.
      alpha = 0.8f
      title = "MAINDY dismiss target"
    }
    try {
      windowManager.addView(view, params)
      dismissTarget = view
      dismissParams = params
    } catch (t: Throwable) {
      Log.w(MaindyEvents.TAG, "Could not add dismiss target", t)
    }
  }

  private fun removeDismissTarget() {
    dismissTarget?.let {
      try {
        windowManager.removeView(it)
      } catch (_: Throwable) {
      }
    }
    dismissTarget = null
    dismissParams = null
  }

  private fun isOverDismissTarget(): Boolean {
    val o = orbParams ?: return false
    val d = dismissParams ?: return false
    val orbCx = o.x + o.width / 2f
    val orbCy = o.y + o.height / 2f
    val tCx = d.x + d.width / 2f
    val tCy = d.y + d.height / 2f
    return hypot(orbCx - tCx, orbCy - tCy) < d.width * 0.9f
  }

  // endregion

  // region Touch handling

  @SuppressLint("ClickableViewAccessibility")
  private fun attachTouchHandling(view: FloatingOrbView) {
    view.setOnTouchListener { _, event ->
      handleTouch(event)
      true
    }
  }

  private fun handleTouch(event: MotionEvent) {
    val view = orb ?: return
    val params = orbParams ?: return
    when (event.actionMasked) {
      MotionEvent.ACTION_DOWN -> {
        snapAnimator?.cancel()
        downRawX = event.rawX
        downRawY = event.rawY
        startX = params.x
        startY = params.y
        dragging = false
        longPressed = false
        view.state = FloatingOrbView.State.PRESSED
        mainHandler.postDelayed(longPressRunnable, ViewConfiguration.getLongPressTimeout().toLong())
      }
      MotionEvent.ACTION_MOVE -> {
        val dx = event.rawX - downRawX
        val dy = event.rawY - downRawY
        if (!dragging && !longPressed && hypot(dx, dy) > touchSlop) {
          dragging = true
          mainHandler.removeCallbacks(longPressRunnable)
          view.state = restingState()
          showDismissTarget()
        }
        if (dragging) {
          params.x = (startX + dx).roundToInt()
          params.y = (startY + dy).roundToInt()
          safeUpdate(view, params)
          val armed = isOverDismissTarget()
          if (armed != view.armedForDismiss) {
            view.armedForDismiss = armed
            dismissTarget?.armed = armed
            if (armed) view.performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK)
          }
        }
      }
      MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
        mainHandler.removeCallbacks(longPressRunnable)
        val cancelled = event.actionMasked == MotionEvent.ACTION_CANCEL
        when {
          longPressed -> {
            longPressed = false
            view.state = restingState()
            MaindyEvents.emit(MaindyEvents.FLOATING_LONG_PRESS_END)
          }
          dragging -> {
            dragging = false
            val dropOnTarget = view.armedForDismiss && !cancelled
            view.armedForDismiss = false
            removeDismissTarget()
            if (dropOnTarget) {
              view.animate().scaleX(0f).scaleY(0f).alpha(0f).setDuration(180L)
                .withEndAction { dismiss("user") }
                .start()
            } else {
              snapToEdge(emitMoved = true)
            }
          }
          else -> {
            view.state = restingState()
            if (!cancelled) onTap(view)
          }
        }
      }
    }
  }

  private fun restingState(): FloatingOrbView.State =
    if (externallyListening) FloatingOrbView.State.LISTENING else FloatingOrbView.State.IDLE

  private fun onTap(view: FloatingOrbView) {
    view.performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY)
    MaindyEvents.emit(MaindyEvents.FLOATING_PRESS)
    MaindyDeepLinks.open(this, MaindyDeepLinks.ASSISTANT)
  }

  private fun onLongPress() {
    val view = orb ?: return
    if (dragging) return
    longPressed = true
    view.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS)
    view.state = FloatingOrbView.State.LISTENING
    MaindyEvents.emit(MaindyEvents.FLOATING_LONG_PRESS)
    MaindyDeepLinks.open(this, MaindyDeepLinks.ASSISTANT_VOICE)
  }

  private fun snapToEdge(emitMoved: Boolean) {
    val view = orb ?: return
    val params = orbParams ?: return
    val bounds = usableBounds()
    val maxX = maxOf(bounds.left, bounds.right - params.width)
    val maxY = maxOf(bounds.top, bounds.bottom - params.height)
    val centerX = params.x + params.width / 2
    val targetX = if (centerX < bounds.centerX()) bounds.left else maxX
    val targetY = params.y.coerceIn(bounds.top, maxY)

    snapAnimator?.cancel()
    snapAnimator = ValueAnimator.ofPropertyValuesHolder(
      PropertyValuesHolder.ofInt("x", params.x, targetX),
      PropertyValuesHolder.ofInt("y", params.y, targetY)
    ).apply {
      duration = 280L
      interpolator = OvershootInterpolator(0.8f)
      addUpdateListener {
        params.x = it.getAnimatedValue("x") as Int
        params.y = it.getAnimatedValue("y") as Int
        safeUpdate(view, params)
      }
      addListener(object : AnimatorListenerAdapter() {
        private var cancelled = false
        override fun onAnimationCancel(animation: Animator) {
          cancelled = true
        }

        override fun onAnimationEnd(animation: Animator) {
          if (cancelled) return
          val xDp = toDp(params.x)
          val yDp = toDp(params.y)
          prefs.edit().putFloat("xDp", xDp.toFloat()).putFloat("yDp", yDp.toFloat()).apply()
          if (emitMoved) {
            MaindyEvents.emit(MaindyEvents.FLOATING_MOVED, mapOf("x" to xDp, "y" to yDp))
          }
        }
      })
      start()
    }
  }

  // endregion

  private fun applyListening(listening: Boolean) {
    externallyListening = listening
    val view = orb ?: return
    if (!dragging && !longPressed) view.state = restingState()
  }

  private fun dismiss(reason: String) {
    dismissReason = reason
    stopSelf()
  }
}
