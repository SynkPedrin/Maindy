package com.maindy.nativemodule.notifications

import android.app.Notification
import android.content.ComponentName
import android.content.Context
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import androidx.core.app.NotificationManagerCompat
import com.maindy.nativemodule.MaindyEvents

/**
 * Notification listener used for MAINDY's focus modes.
 *
 * The system binds this service ONLY after the user enables "Notification access" for MAINDY in
 * system settings; until then none of this code runs. Contents (title/text) of other apps'
 * notifications are forwarded to JS only when the user explicitly turned `muteContents` off.
 *
 * Filtering limitation: [cancelNotification] only removes the notification from the shade. The
 * sound/vibration/heads-up of the original notification may already have happened, and the other
 * app is not affected in any other way. This is Android-only and user-granted.
 */
class MaindyNotificationListenerService : NotificationListenerService() {

  companion object {
    @Volatile
    var isConnected: Boolean = false
      private set

    private val NEVER_FILTER_PACKAGES = setOf(
      "android",
      "com.android.systemui",
      "com.android.phone",
      "com.android.server.telecom"
    )

    private val NEVER_FILTER_CATEGORIES = setOf(
      Notification.CATEGORY_CALL,
      Notification.CATEGORY_ALARM,
      Notification.CATEGORY_SYSTEM
    )

    fun hasAccess(context: Context): Boolean =
      NotificationManagerCompat.getEnabledListenerPackages(context).contains(context.packageName)

    fun componentName(context: Context): ComponentName =
      ComponentName(context, MaindyNotificationListenerService::class.java)
  }

  override fun onListenerConnected() {
    super.onListenerConnected()
    isConnected = true
  }

  override fun onListenerDisconnected() {
    isConnected = false
    super.onListenerDisconnected()
  }

  override fun onNotificationPosted(sbn: StatusBarNotification?) {
    if (sbn == null) return
    if (sbn.packageName == packageName) return

    try {
      val rules = NotificationFilterRules.load(this)
      val notification = sbn.notification
      val category: String? = notification?.category

      val dismissed = if (shouldFilter(sbn, category, rules)) {
        cancelNotification(sbn.key)
        true
      } else {
        false
      }

      val body = HashMap<String, Any?>()
      body["packageName"] = sbn.packageName
      body["category"] = category
      @Suppress("DEPRECATION")
      body["priority"] = notification?.priority ?: 0
      body["importance"] = channelImportance(sbn.key)
      body["postedAt"] = sbn.postTime.toDouble()
      body["isOngoing"] = sbn.isOngoing
      body["dismissedByFocus"] = dismissed
      body["focusMode"] = rules.focusMode
      if (!rules.muteContents && notification != null) {
        // Only when the user explicitly enabled it.
        val extras = notification.extras
        body["title"] = extras?.getCharSequence(Notification.EXTRA_TITLE)?.toString()
        body["text"] = extras?.getCharSequence(Notification.EXTRA_TEXT)?.toString()
      }
      MaindyEvents.emit(MaindyEvents.NOTIFICATION_POSTED, body)
    } catch (t: Throwable) {
      Log.w(MaindyEvents.TAG, "onNotificationPosted failed", t)
    }
  }

  private fun shouldFilter(
    sbn: StatusBarNotification,
    category: String?,
    rules: NotificationFilterRules
  ): Boolean {
    if (!rules.isFiltering) return false
    if (sbn.packageName in rules.allowPackages) return false
    if (sbn.packageName in NEVER_FILTER_PACKAGES) return false
    if (category != null && category in NEVER_FILTER_CATEGORIES) return false
    if (sbn.isOngoing || !sbn.isClearable) return false
    val flags = sbn.notification?.flags ?: 0
    if (flags and Notification.FLAG_FOREGROUND_SERVICE != 0) return false
    return true
  }

  /** Channel importance (NotificationManager.IMPORTANCE_*), or -1000 when unknown. */
  private fun channelImportance(key: String): Int {
    return try {
      val ranking = Ranking()
      if (currentRanking?.getRanking(key, ranking) == true) ranking.importance else -1000
    } catch (_: Throwable) {
      -1000
    }
  }
}
