package com.expensetracker.notification

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.database.sqlite.SQLiteDatabase
import android.os.Build
import android.util.Log
import java.util.Calendar

object ReportScheduler {

    private const val TAG = "ReportScheduler"

    const val REPORT_TYPE_DAILY = "daily"
    const val REPORT_TYPE_WEEKLY = "weekly"
    const val REPORT_TYPE_MONTHLY = "monthly"

    const val REQUEST_CODE_DAILY = 1001
    const val REQUEST_CODE_WEEKLY = 1002
    const val REQUEST_CODE_MONTHLY = 1003

    fun scheduleAll(context: Context) {
        scheduleReport(context, REPORT_TYPE_DAILY)
        scheduleReport(context, REPORT_TYPE_WEEKLY)
        scheduleReport(context, REPORT_TYPE_MONTHLY)
    }

    private fun getSetting(context: Context, key: String, defaultValue: String): String {
        return try {
            val dbPath = context.getDatabasePath("expense_tracker.db")
            if (!dbPath.exists()) return defaultValue
            val db = SQLiteDatabase.openDatabase(dbPath.absolutePath, null, SQLiteDatabase.OPEN_READONLY)
            val cursor = db.rawQuery("SELECT value FROM settings WHERE key = ? LIMIT 1", arrayOf(key))
            var value = defaultValue
            if (cursor.moveToFirst()) {
                value = cursor.getString(0) ?: defaultValue
            }
            cursor.close()
            db.close()
            value
        } catch (e: Exception) {
            Log.w(TAG, "Failed to read setting $key from SQLite: ${e.message}")
            defaultValue
        }
    }

    fun scheduleReport(context: Context, reportType: String) {
        val enabledKey = "report_${reportType}_enabled"
        val timeKey = "report_${reportType}_time"

        val isEnabled = getSetting(context, enabledKey, "true") == "true"
        val timeStr = getSetting(context, timeKey, "22:00") // Default 10:00 PM

        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val requestCode = when (reportType) {
            REPORT_TYPE_WEEKLY -> REQUEST_CODE_WEEKLY
            REPORT_TYPE_MONTHLY -> REQUEST_CODE_MONTHLY
            else -> REQUEST_CODE_DAILY
        }

        val intent = Intent(context, ReportAlarmReceiver::class.java).apply {
            action = ReportAlarmReceiver.ACTION_GENERATE_REPORT
            putExtra(ReportAlarmReceiver.EXTRA_REPORT_TYPE, reportType)
        }
        val pendingIntent = PendingIntent.getBroadcast(
            context,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        if (!isEnabled) {
            alarmManager.cancel(pendingIntent)
            Log.d(TAG, "Cancelled $reportType report alarm.")
            return
        }

        val parts = timeStr.split(":")
        val hour = parts.getOrNull(0)?.toIntOrNull() ?: 22
        val minute = parts.getOrNull(1)?.toIntOrNull() ?: 0

        val calendar = Calendar.getInstance().apply {
            set(Calendar.HOUR_OF_DAY, hour)
            set(Calendar.MINUTE, minute)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }

        val now = System.currentTimeMillis()

        when (reportType) {
            REPORT_TYPE_DAILY -> {
                if (calendar.timeInMillis <= now) {
                    calendar.add(Calendar.DAY_OF_YEAR, 1)
                }
            }
            REPORT_TYPE_WEEKLY -> {
                // Target Sunday
                calendar.set(Calendar.DAY_OF_WEEK, Calendar.SUNDAY)
                if (calendar.timeInMillis <= now) {
                    calendar.add(Calendar.WEEK_OF_YEAR, 1)
                }
            }
            REPORT_TYPE_MONTHLY -> {
                // Target last day of month
                val lastDay = calendar.getActualMaximum(Calendar.DAY_OF_MONTH)
                calendar.set(Calendar.DAY_OF_MONTH, lastDay)
                if (calendar.timeInMillis <= now) {
                    calendar.add(Calendar.MONTH, 1)
                    val nextLastDay = calendar.getActualMaximum(Calendar.DAY_OF_MONTH)
                    calendar.set(Calendar.DAY_OF_MONTH, nextLastDay)
                }
            }
        }

        val triggerTime = calendar.timeInMillis
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerTime, pendingIntent)
            } else {
                alarmManager.setExact(AlarmManager.RTC_WAKEUP, triggerTime, pendingIntent)
            }
            Log.i(TAG, "Scheduled $reportType report for ${calendar.time}")
        } catch (e: SecurityException) {
            Log.w(TAG, "Cannot set exact alarm, falling back to inexact alarm: ${e.message}")
            alarmManager.set(AlarmManager.RTC_WAKEUP, triggerTime, pendingIntent)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to schedule $reportType report", e)
        }
    }
}

