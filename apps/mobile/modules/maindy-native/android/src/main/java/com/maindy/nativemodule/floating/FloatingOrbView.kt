package com.maindy.nativemodule.floating

import android.animation.ValueAnimator
import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RadialGradient
import android.graphics.Shader
import android.graphics.SweepGradient
import android.graphics.drawable.Drawable
import android.view.View
import android.view.animation.AccelerateDecelerateInterpolator
import android.view.animation.OvershootInterpolator

/**
 * The floating orb. Draws either the app-provided `orb_idle` / `orb_listening` drawables (looked
 * up by name at runtime, so they can be added later by a config plugin) or, when they are absent,
 * a fallback orb painted with Canvas gradients in MAINDY's brand colors.
 *
 * The view itself only renders state; touch handling lives in [FloatingAgentService].
 */
@SuppressLint("ViewConstructor")
class FloatingOrbView(context: Context) : View(context) {

  enum class State { IDLE, PRESSED, LISTENING }

  var state: State = State.IDLE
    set(value) {
      if (field == value) return
      field = value
      animatePressScale(if (value == State.PRESSED) 0.9f else 1f)
      invalidate()
    }

  /** True while the orb is being dragged over the dismiss target. */
  var armedForDismiss: Boolean = false
    set(value) {
      if (field == value) return
      field = value
      invalidate()
    }

  private val idleDrawable: Drawable? = loadAppDrawable("orb_idle")
  private val listeningDrawable: Drawable? = loadAppDrawable("orb_listening") ?: idleDrawable

  private val glowPaint = Paint(Paint.ANTI_ALIAS_FLAG)
  private val bodyPaint = Paint(Paint.ANTI_ALIAS_FLAG)
  private val rimPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
  private val highlightPaint = Paint(Paint.ANTI_ALIAS_FLAG)
  private val sparkPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = BrandColors.YELLOW }

  /** 0..1, driven by the breathing animator. */
  private var breath = 0f
  private var pressScale = 1f
  private var pressAnimator: ValueAnimator? = null

  private val breathingAnimator = ValueAnimator.ofFloat(0f, 1f).apply {
    duration = 1800L
    repeatMode = ValueAnimator.REVERSE
    repeatCount = ValueAnimator.INFINITE
    interpolator = AccelerateDecelerateInterpolator()
    addUpdateListener {
      breath = it.animatedValue as Float
      invalidate()
    }
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    if (!breathingAnimator.isStarted) breathingAnimator.start()
  }

  override fun onDetachedFromWindow() {
    breathingAnimator.cancel()
    pressAnimator?.cancel()
    super.onDetachedFromWindow()
  }

  override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
    super.onSizeChanged(w, h, oldw, oldh)
    val cx = w / 2f
    val cy = h / 2f
    val r = orbRadius()
    bodyPaint.shader = RadialGradient(
      cx - r * 0.35f, cy - r * 0.4f, r * 1.5f,
      intArrayOf(BrandColors.MAGENTA, BrandColors.PURPLE, BrandColors.NAVY),
      floatArrayOf(0f, 0.55f, 1f),
      Shader.TileMode.CLAMP
    )
    rimPaint.strokeWidth = r * 0.09f
    rimPaint.shader = SweepGradient(
      cx, cy,
      intArrayOf(BrandColors.PURPLE, BrandColors.MAGENTA, BrandColors.YELLOW, BrandColors.MAGENTA, BrandColors.PURPLE),
      null
    )
    highlightPaint.shader = RadialGradient(
      cx - r * 0.35f, cy - r * 0.45f, r * 0.45f,
      intArrayOf(Color.argb(150, 255, 255, 255), Color.argb(0, 255, 255, 255)),
      null,
      Shader.TileMode.CLAMP
    )
    val glowRadius = minOf(w, h) / 2f
    if (glowRadius > 0f) {
      idleGlow = glowShader(cx, cy, r, glowRadius, BrandColors.PURPLE)
      listeningGlow = glowShader(cx, cy, r, glowRadius, BrandColors.MAGENTA)
      dangerGlow = glowShader(cx, cy, r, glowRadius, Color.rgb(255, 64, 96))
    }
  }

  private var idleGlow: Shader? = null
  private var listeningGlow: Shader? = null
  private var dangerGlow: Shader? = null

  private fun glowShader(cx: Float, cy: Float, r: Float, glowRadius: Float, color: Int): Shader =
    RadialGradient(
      cx, cy, glowRadius,
      intArrayOf(withAlpha(color, 210), withAlpha(color, 90), withAlpha(color, 0)),
      floatArrayOf(r / glowRadius * 0.85f, r / glowRadius * 1.08f, 1f),
      Shader.TileMode.CLAMP
    )

  override fun onDraw(canvas: Canvas) {
    super.onDraw(canvas)
    val cx = width / 2f
    val cy = height / 2f
    val r = orbRadius()
    val listening = state == State.LISTENING

    // Glow: breathes in idle, strong and warm while listening, red-ish when armed for dismissal.
    val glowStrength = when {
      armedForDismiss -> 0.9f
      listening -> 0.75f + 0.25f * breath
      else -> 0.35f + 0.25f * breath
    }
    glowPaint.shader = when {
      armedForDismiss -> dangerGlow
      listening -> listeningGlow
      else -> idleGlow
    }
    // Paint alpha modulates the (pre-built) shader, so no allocation happens per frame.
    glowPaint.alpha = (glowStrength * 255).toInt().coerceIn(0, 255)
    canvas.drawCircle(cx, cy, width / 2f, glowPaint)

    val breathScale = if (listening) 1f + 0.05f * breath else 0.95f + 0.05f * breath
    val scale = breathScale * pressScale
    canvas.save()
    canvas.scale(scale, scale, cx, cy)

    val image = if (listening) listeningDrawable else idleDrawable
    if (image != null) {
      image.setBounds((cx - r).toInt(), (cy - r).toInt(), (cx + r).toInt(), (cy + r).toInt())
      image.draw(canvas)
    } else {
      drawFallbackOrb(canvas, cx, cy, r, listening)
    }
    canvas.restore()
  }

  private fun drawFallbackOrb(canvas: Canvas, cx: Float, cy: Float, r: Float, listening: Boolean) {
    canvas.drawCircle(cx, cy, r, bodyPaint)
    canvas.save()
    // Slowly rotate the rim with the breath so the orb feels alive.
    canvas.rotate(breath * 120f + if (listening) 60f else 0f, cx, cy)
    canvas.drawCircle(cx, cy, r - rimPaint.strokeWidth / 2f, rimPaint)
    canvas.restore()
    canvas.drawCircle(cx, cy, r, highlightPaint)
    val sparkR = r * (if (listening) 0.16f + 0.06f * breath else 0.1f)
    canvas.drawCircle(cx + r * 0.38f, cy + r * 0.34f, sparkR, sparkPaint)
  }

  /** The orb body occupies ~68% of the window; the rest is room for glow and scale. */
  private fun orbRadius(): Float = minOf(width, height) / 2f * 0.68f

  private fun animatePressScale(target: Float) {
    pressAnimator?.cancel()
    pressAnimator = ValueAnimator.ofFloat(pressScale, target).apply {
      duration = 160L
      interpolator = OvershootInterpolator(2f)
      addUpdateListener {
        pressScale = it.animatedValue as Float
        invalidate()
      }
      start()
    }
  }

  @SuppressLint("DiscouragedApi")
  private fun loadAppDrawable(name: String): Drawable? {
    val id = context.resources.getIdentifier(name, "drawable", context.packageName)
    if (id == 0) return null
    return try {
      context.getDrawable(id)
    } catch (_: Throwable) {
      null
    }
  }

  private fun withAlpha(color: Int, alpha: Int): Int =
    Color.argb(alpha.coerceIn(0, 255), Color.red(color), Color.green(color), Color.blue(color))
}

/** Bottom "remove" target shown only while the orb is dragged. Not touchable. */
@SuppressLint("ViewConstructor")
class DismissTargetView(context: Context) : View(context) {
  var armed: Boolean = false
    set(value) {
      if (field == value) return
      field = value
      invalidate()
    }

  private val fill = Paint(Paint.ANTI_ALIAS_FLAG)
  private val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    style = Paint.Style.STROKE
    color = Color.WHITE
    strokeCap = Paint.Cap.ROUND
  }

  override fun onDraw(canvas: Canvas) {
    super.onDraw(canvas)
    val cx = width / 2f
    val cy = height / 2f
    val r = minOf(width, height) / 2f * (if (armed) 0.95f else 0.78f)
    fill.color = if (armed) Color.argb(235, 255, 64, 96) else Color.argb(200, 5, 8, 43)
    canvas.drawCircle(cx, cy, r, fill)
    stroke.strokeWidth = r * 0.12f
    val arm = r * 0.36f
    canvas.drawLine(cx - arm, cy - arm, cx + arm, cy + arm, stroke)
    canvas.drawLine(cx + arm, cy - arm, cx - arm, cy + arm, stroke)
  }
}

object BrandColors {
  val NAVY = Color.parseColor("#05082B")
  val PURPLE = Color.parseColor("#7600FF")
  val MAGENTA = Color.parseColor("#D000E8")
  val YELLOW = Color.parseColor("#FFC400")
}
