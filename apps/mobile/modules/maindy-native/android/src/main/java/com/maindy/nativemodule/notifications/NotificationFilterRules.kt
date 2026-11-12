package com.maindy.nativemodule.notifications

import android.content.Context

/**
 * Focus-mode filter rules, persisted in the app's private SharedPreferences so the listener
 * service (which can be bound by the system while the JS runtime is not running) can read them.
 */
data class NotificationFilterRules(
  val focusMode: String,
  val allowPackages: Set<String>,
  /** When true (the default) titles/texts of third-party notifications are never forwarded to JS. */
  val muteContents: Boolean
) {
  val isFiltering: Boolean get() = focusMode != "off"

  fun toMap(): Map<String, Any?> = mapOf(
    "focusMode" to focusMode,
    "allowPackages" to allowPackages.sorted(),
    "muteContents" to muteContents
  )

  companion object {
    val FOCUS_MODES = setOf("off", "work", "study", "rest", "sleep", "driving")
    val DEFAULT = NotificationFilterRules("off", emptySet(), muteContents = true)

    private const val PREFS = "maindy_notification_rules"
    private const val KEY_MODE = "focusMode"
    private const val KEY_ALLOW = "allowPackages"
    private const val KEY_MUTE = "muteContents"

    fun load(context: Context): NotificationFilterRules {
      val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      val mode = prefs.getString(KEY_MODE, "off")?.takeIf { it in FOCUS_MODES } ?: "off"
      val allow = prefs.getStringSet(KEY_ALLOW, emptySet())?.toSet() ?: emptySet()
      val mute = prefs.getBoolean(KEY_MUTE, true)
      return NotificationFilterRules(mode, allow, mute)
    }

    fun save(context: Context, rules: NotificationFilterRules) {
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        .edit()
        .putString(KEY_MODE, rules.focusMode)
        // Always store a fresh set instance (SharedPreferences must not get a mutated set back).
        .putStringSet(KEY_ALLOW, HashSet(rules.allowPackages))
        .putBoolean(KEY_MUTE, rules.muteContents)
        .apply()
    }
  }
}
