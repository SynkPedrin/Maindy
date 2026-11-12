package com.maindy.nativemodule.usage

import android.app.AppOpsManager
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.Process

/**
 * Read-only access to app usage totals. Requires the user to enable "Usage access" for MAINDY in
 * system settings (PACKAGE_USAGE_STATS is a special app-op permission, never auto-granted).
 */
object UsageStatsHelper {

  fun hasUsageAccess(context: Context): Boolean {
    val appOps = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
    @Suppress("DEPRECATION") // unsafeCheckOpNoThrow is deprecated on API 36 but still the documented API for 29+.
    val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      appOps.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName)
    } else {
      @Suppress("DEPRECATION")
      appOps.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName)
    }
    return if (mode == AppOpsManager.MODE_DEFAULT) {
      context.checkCallingOrSelfPermission(android.Manifest.permission.PACKAGE_USAGE_STATS) ==
        PackageManager.PERMISSION_GRANTED
    } else {
      mode == AppOpsManager.MODE_ALLOWED
    }
  }

  /**
   * Per-package foreground totals since [sinceMs] until now.
   *
   * Note: [UsageStatsManager.queryAndAggregateUsageStats] aggregates the system's usage buckets
   * (daily/weekly/...), so totals can include some time from the bucket that straddles [sinceMs].
   */
  fun getUsageSummary(context: Context, sinceMs: Long): List<Map<String, Any?>> {
    val usm = context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
    val now = System.currentTimeMillis()
    val begin = sinceMs.coerceIn(0L, now)
    val stats = usm.queryAndAggregateUsageStats(begin, now)
    return stats.values
      .filter { it.totalTimeInForeground > 0L }
      .sortedByDescending { it.totalTimeInForeground }
      .map {
        mapOf(
          "packageName" to it.packageName,
          "totalTimeForegroundMs" to it.totalTimeInForeground.toDouble(),
          "lastTimeUsed" to it.lastTimeUsed.toDouble()
        )
      }
  }
}
