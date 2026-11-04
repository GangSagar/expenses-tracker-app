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
        val dbPath = NotificationHelper.getDatabaseFile(context)
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

            // Format notification with rich typography and semantic financial colors
            val periodLabel = when (reportType) {
                ReportScheduler.REPORT_TYPE_WEEKLY -> "Weekly"
                ReportScheduler.REPORT_TYPE_MONTHLY -> "Monthly"
                else -> "Daily"
            }

            val title = "<b>$periodLabel Financial Digest</b>"

            val net = totalIncome - totalExpense
            val isSurplus = net >= 0
            val netColor = if (isSurplus) "#0D652D" else "#C5221F"
            val netSign = if (isSurplus) "+" else "-"
            val absNet = Math.abs(net)
            val netBadge = if (isSurplus) "SURPLUS" else "DEFICIT"

            val summary = if (expenseCount == 0 && incomeCount == 0) {
                "<font color=\"#1A73E8\"><b>Budget Intact</b></font> &nbsp;No transactions recorded"
            } else {
                "<font color=\"$netColor\"><b>$netSign₹${String.format("%.0f", absNet)} Net</b></font> &nbsp;<font color=\"#5F6368\">| Outflow ₹${String.format("%.0f", totalExpense)} | Inflow ₹${String.format("%.0f", totalIncome)}</font>"
            }

            val details = if (expenseCount == 0 && incomeCount == 0) {
                """
                <b>Budget Status:</b> <font color="#1A73E8"><b>Fully Intact</b></font><br>
                <font color="#5F6368"><small>Zero expenses recorded in this period. Your monthly savings trajectory remains strong.</small></font>
                """.trimIndent()
            } else {
                val topCatSection = if (topCategoryAmount > 0 && totalExpense > 0) {
                    val pct = ((topCategoryAmount / totalExpense) * 100).toInt()
                    """
                    <br><b>Primary Outlay:</b> <b>$topCategory</b> &nbsp;<font color="#5F6368">— ₹${String.format("%.2f", topCategoryAmount)} ($pct% of total spend)</font>
                    """.trimIndent()
                } else ""

                """
                <b>Net Cashflow:</b> <font color="$netColor"><b>$netSign₹${String.format("%.2f", absNet)} ($netBadge)</b></font><br>
                <b>Outflow:</b> <font color="#C5221F"><b>↗ ₹${String.format("%.2f", totalExpense)}</b></font> <font color="#5F6368"><small>($expenseCount ${if (expenseCount == 1) "debit" else "debits"})</small></font><br>
                <b>Inflow:</b> <font color="#0D652D"><b>↙ ₹${String.format("%.2f", totalIncome)}</b></font> <font color="#5F6368"><small>($incomeCount ${if (incomeCount == 1) "credit" else "credits"})</small></font>
                $topCatSection
                """.trimIndent()
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

