package com.maindy.nativemodule

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.maindy.nativemodule.floating.FloatingAgentService
import com.maindy.nativemodule.notifications.MaindyNotificationListenerService
import com.maindy.nativemodule.notifications.NotificationFilterRules
import com.maindy.nativemodule.usage.UsageStatsHelper
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class OverlayPermissionMissingException :
  CodedException("ERR_OVERLAY_PERMISSION", "MAINDY does not have the 'Display over other apps' permission. Call FloatingAgent.requestOverlayPermission() and let the user enable it.", null)

class UsageAccessMissingException :
  CodedException("ERR_USAGE_ACCESS", "Usage access has not been granted to MAINDY. Call Usage.openUsageAccessSettings() and let the user enable it.", null)

class InvalidFocusModeException(mode: String) :
  CodedException("ERR_INVALID_FOCUS_MODE", "Unknown focusMode '$mode'. Expected one of ${NotificationFilterRules.FOCUS_MODES.sorted()}.", null)

class FloatingAgentStartException(cause: Throwable) :
  CodedException("ERR_FLOATING_AGENT_START", "Could not start the floating agent service: ${cause.message}", cause)

class MaindyNativeModule : Module() {

  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private var eventSink: ((String, Map<String, Any?>) -> Unit)? = null

  override fun definition() = ModuleDefinition {
    Name("MaindyNative")

    Events(*MaindyEvents.ALL)

    OnCreate {
      val sink: (String, Map<String, Any?>) -> Unit = { name, body -> sendEvent(name, body) }
      eventSink = sink
      MaindyEvents.sink = sink
    }

    OnDestroy {
      if (MaindyEvents.sink === eventSink) MaindyEvents.sink = null
      eventSink = null
    }

    // region Floating agent

    Function("floatingHasOverlayPermission") {
      Settings.canDrawOverlays(context)
    }

    Function("floatingRequestOverlayPermission") {
      val intent = Intent(
        Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
        Uri.parse("package:${context.packageName}")
      )
      startSettingsActivity(intent)
    }

    AsyncFunction("floatingShow") { sizeDp: Double?, x: Double?, y: Double? ->
      val ctx = context
      if (!Settings.canDrawOverlays(ctx)) throw OverlayPermissionMissingException()
      val intent = FloatingAgentService.buildShowIntent(ctx, sizeDp, x, y)
      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          ctx.startForegroundService(intent)
        } else {
          ctx.startService(intent)
        }
      } catch (t: Throwable) {
        // e.g. ForegroundServiceStartNotAllowedException when called while the app is in background.
        throw FloatingAgentStartException(t)
      }
      Unit
    }

    Function("floatingHide") {
      FloatingAgentService.hide(context)
    }

    Function("floatingIsShowing") {
      FloatingAgentService.isShowing
    }

    Function("floatingSetListening") { listening: Boolean ->
      FloatingAgentService.setListening(listening)
    }

    // endregion

    // region Notifications

    Function("notificationsHasListenerAccess") {
      MaindyNotificationListenerService.hasAccess(context)
    }

    Function("notificationsOpenListenerSettings") {
      val ctx = context
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        val detail = Intent(Settings.ACTION_NOTIFICATION_LISTENER_DETAIL_SETTINGS).putExtra(
          Settings.EXTRA_NOTIFICATION_LISTENER_COMPONENT_NAME,
          MaindyNotificationListenerService.componentName(ctx).flattenToString()
        )
        if (startSettingsActivity(detail)) return@Function true
      }
      startSettingsActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
    }

    Function("notificationsSetFilterRules") { focusMode: String, allowPackages: List<String>, muteContents: Boolean ->
      if (focusMode !in NotificationFilterRules.FOCUS_MODES) throw InvalidFocusModeException(focusMode)
      NotificationFilterRules.save(
        context,
        NotificationFilterRules(focusMode, allowPackages.toSet(), muteContents)
      )
    }

    Function("notificationsGetFilterRules") {
      NotificationFilterRules.load(context).toMap()
    }

    // endregion

    // region Usage stats

    Function("usageHasAccess") {
      UsageStatsHelper.hasUsageAccess(context)
    }

    Function("usageOpenSettings") {
      val ctx = context
      // Some OEMs/versions accept a package: URI and open MAINDY's own page directly.
      val direct = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS, Uri.parse("package:${ctx.packageName}"))
      if (startSettingsActivity(direct)) return@Function true
      startSettingsActivity(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS))
    }

    AsyncFunction("usageGetSummary") { sinceMs: Double ->
      val ctx = context
      if (!UsageStatsHelper.hasUsageAccess(ctx)) throw UsageAccessMissingException()
      UsageStatsHelper.getUsageSummary(ctx, sinceMs.toLong())
    }

    // endregion
  }

  /** Opens a system settings screen. Returns false if no activity can handle the intent. */
  private fun startSettingsActivity(intent: Intent): Boolean {
    val activity = appContext.currentActivity
    return try {
      if (activity != null) {
        activity.startActivity(intent)
      } else {
        context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      }
      true
    } catch (_: Throwable) {
      false
    }
  }
}
