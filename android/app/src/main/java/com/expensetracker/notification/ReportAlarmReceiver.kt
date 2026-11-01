package com.expensetracker.notification

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.database.sqlite.SQLiteDatabase
import android.util.Log
import java.util.Calendar

class ReportAlarmReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "ReportAlarmReceiver"
        const val ACTION_GENERATE_REPORT = "com.expensetracker.ACTION_GENERATE_REPORT"
        const val EXTRA_REPORT_TYPE = "extra_report_type"
    }

    override fun onReceive(context: Context, intent: Intent) {
        val reportType = intent.getStringExtra(EXTRA_REPORT_TYPE) ?: ReportScheduler.REPORT_TYPE_DAILY
        Log.i(TAG, "Triggering financial report: $reportType")

        // Reschedule next occurrence
        ReportScheduler.scheduleReport(context, reportType)

        // Generate report from SQLite
        val dbPath = context.getDatabasePath("expense_tracker.db")
        if (!dbPath.exists()) {
            Log.d(TAG, "Database does not exist; skipping report generation.")
            return
        }

        try {
            val startTimestamp = calculateWindowStart(reportType)
            val db = SQLiteDatabase.openDatabase(dbPath.absolutePath, null, SQLiteDatabase.OPEN_READONLY)

            var totalExpense = 0.0
            var totalIncome = 0.0
            var expenseCount = 0
            var incomeCount = 0

            val summaryCursor = db.rawQuery(
                """
                SELECT transaction_type, SUM(amount), COUNT(*) 
                FROM expenses 
                WHERE timestamp >= ? AND is_invalid = 0 AND is_duplicate = 0 
                GROUP BY transaction_type
                """.trimIndent(),
                arrayOf(startTimestamp.toString())
            )

            while (summaryCursor.moveToNext()) {
                val type = summaryCursor.getString(0)
                val sum = summaryCursor.getDouble(1)
                val count = summaryCursor.getInt(2)
                if (type == "credit" || type == "income") {
                    totalIncome = sum
                    incomeCount = count
                } else {
                    totalExpense = sum
                    expenseCount = count
                }
            }
            summaryCursor.close()

            // Find top expense category
            var topCategory = "None"
            var topCategoryAmount = 0.0
            val catCursor = db.rawQuery(
                """
                SELECT category, SUM(amount) as cat_sum 
                FROM expenses 
                WHERE timestamp >= ? AND transaction_type = 'debit' AND is_invalid = 0 AND is_duplicate = 0 
                GROUP BY category 
                ORDER BY cat_sum DESC 
                LIMIT 1
                """.trimIndent(),
                arrayOf(startTimestamp.toString())
            )
            if (catCursor.moveToFirst()) {
                topCategory = catCursor.getString(0) ?: "None"
                topCategoryAmount = catCursor.getDouble(1)
            }
            catCursor.close()
            db.close()

            // Format notification
            val periodLabel = when (reportType) {
                ReportScheduler.REPORT_TYPE_WEEKLY -> "Weekly"
                ReportScheduler.REPORT_TYPE_MONTHLY -> "Monthly"
                else -> "Daily"
            }

            val title = "📊 $periodLabel Expense Report"
            val summary = "Spent: ↗ ₹${String.format("%.0f", totalExpense)} | Received: ↙ ₹${String.format("%.0f", totalIncome)}"

            val net = totalIncome - totalExpense
            val netSign = if (net >= 0) "+" else "-"
            val absNet = Math.abs(net)

            val details = buildString {
                appendLine("$periodLabel Financial Summary:")
                appendLine("• Total Spent:  ↗ ₹${String.format("%.2f", totalExpense)} ($expenseCount txns)")
                appendLine("• Total Income: ↙ ₹${String.format("%.2f", totalIncome)} ($incomeCount txns)")
                appendLine("• Net Balance:  $netSign₹${String.format("%.2f", absNet)}")
                if (topCategoryAmount > 0) {
                    appendLine("• Top Category: $topCategory (₹${String.format("%.0f", topCategoryAmount)})")
                }
            }

            val notificationId = when (reportType) {
                ReportScheduler.REPORT_TYPE_WEEKLY -> 9002
                ReportScheduler.REPORT_TYPE_MONTHLY -> 9003
                else -> 9001
            }

            NotificationHelper.showReportNotification(
                context = context,
                id = notificationId,
                title = title,
                summary = summary,
                details = details,
                reportType = reportType
            )
        } catch (e: Exception) {
            Log.e(TAG, "Failed to build report notification", e)
        }
    }

    private fun calculateWindowStart(reportType: String): Long {
        val calendar = Calendar.getInstance().apply {
            set(Calendar.HOUR_OF_DAY, 0)
            set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }

        when (reportType) {
            ReportScheduler.REPORT_TYPE_WEEKLY -> {
                calendar.set(Calendar.DAY_OF_WEEK, calendar.firstDayOfWeek)
            }
            ReportScheduler.REPORT_TYPE_MONTHLY -> {
                calendar.set(Calendar.DAY_OF_MONTH, 1)
            }
        }
        return calendar.timeInMillis
    }
}

