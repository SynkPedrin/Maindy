package com.maindy.nativemodule

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.util.Log

/**
 * Bridge between Android components that outlive the JS runtime (the floating-agent foreground
 * service, the notification listener) and the Expo module, which is the only thing that can
 * emit events to JavaScript.
 *
 * When the JS runtime is not alive (app process started only for a service), [sink] is null and
 * events are dropped on purpose: nothing is queued or persisted.
 */
object MaindyEvents {
  const val FLOATING_PRESS = "onFloatingAgentPress"
  const val FLOATING_LONG_PRESS = "onFloatingAgentLongPress"
  const val FLOATING_LONG_PRESS_END = "onFloatingAgentLongPressEnd"
  const val FLOATING_MOVED = "onFloatingAgentMoved"
  const val FLOATING_DISMISSED = "onFloatingAgentDismissed"
  const val NOTIFICATION_POSTED = "onNotificationPosted"

  val ALL = arrayOf(
    FLOATING_PRESS,
    FLOATING_LONG_PRESS,
    FLOATING_LONG_PRESS_END,
    FLOATING_MOVED,
    FLOATING_DISMISSED,
    NOTIFICATION_POSTED
  )

  @Volatile
  var sink: ((String, Map<String, Any?>) -> Unit)? = null

  fun emit(name: String, body: Map<String, Any?> = emptyMap()) {
    try {
      sink?.invoke(name, body)
    } catch (t: Throwable) {
      Log.w(TAG, "Failed to emit $name", t)
    }
  }

  const val TAG = "MaindyNative"
}

object MaindyDeepLinks {
  const val ASSISTANT = "maindy://assistant"
  const val ASSISTANT_VOICE = "maindy://assistant?voice=1"

  /**
   * Opens one of MAINDY's own deep links. The intent is restricted to our package so it can
   * never be resolved by another app.
   *
   * Starting an activity from a service is subject to Android's background-activity-launch
   * rules; holders of SYSTEM_ALERT_WINDOW with a visible overlay window (our orb) are exempt.
   */
  fun open(context: Context, url: String): Boolean {
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
      setPackage(context.packageName)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    }
    return try {
      context.startActivity(intent)
      true
    } catch (t: Throwable) {
      Log.w(MaindyEvents.TAG, "Could not open $url", t)
      false
    }
  }
}
