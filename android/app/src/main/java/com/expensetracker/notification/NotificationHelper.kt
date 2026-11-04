package com.expensetracker.notification

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.os.Build
import android.text.Html
import android.util.Log
import androidx.core.app.NotificationCompat
import com.expensetracker.MainActivity

object NotificationHelper {

    private const val TAG = "NotificationHelper"

    const val CHANNEL_TRANSACTIONS = "expense_tracker_transactions"
    const val CHANNEL_REPORTS = "expense_tracker_reports"
    const val CHANNEL_ALERTS = "expense_tracker_alerts"

    fun getDatabaseFile(context: Context): java.io.File {
        val standard = context.getDatabasePath("expense_tracker.db")
        if (standard.exists()) return standard
        val inFiles = java.io.File(context.filesDir, "expense_tracker.db")
        if (inFiles.exists()) return inFiles
        return standard
    }

    fun getSmallIconResId(context: Context): Int {
        val resId = context.resources.getIdentifier("ic_notification", "drawable", context.packageName)
        if (resId != 0) return resId
        val fallback = context.resources.getIdentifier("ic_launcher", "mipmap", context.packageName)
        return if (fallback != 0) fallback else android.R.drawable.ic_dialog_info
    }

    fun getSpendwiseLogoBitmap(context: Context): Bitmap? {
        val resId = context.resources.getIdentifier("ic_spendwise_logo", "drawable", context.packageName)
        if (resId != 0) {
            return try {
                val logo = BitmapFactory.decodeResource(context.resources, resId)
                val size = 192
                val output = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
                val canvas = Canvas(output)
                val paint = Paint(Paint.ANTI_ALIAS_FLAG)
                val radius = size / 2f
                canvas.drawCircle(radius, radius, radius - 2f, paint)
                paint.xfermode = PorterDuffXfermode(PorterDuff.Mode.SRC_IN)
                val scaled = Bitmap.createScaledBitmap(logo, size, size, true)
                canvas.drawBitmap(scaled, 0f, 0f, paint)

                val borderPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                    color = Color.parseColor("#1A73E8")
                    style = Paint.Style.STROKE
                    strokeWidth = 3f
                }
                canvas.drawCircle(radius, radius, radius - 3.5f, borderPaint)
                output
            } catch (e: Exception) {
                Log.w(TAG, "Failed to decode spendwise logo bitmap", e)
                null
            }
        }
        return null
    }

    fun getReportIconBitmap(context: Context, reportType: String?): Bitmap? {
        val resName = when (reportType?.lowercase()) {
            "daily" -> "ic_report_daily"
            "weekly" -> "ic_report_weekly"
            "monthly" -> "ic_report_monthly"
            else -> "ic_report_daily"
        }
        val resId = context.resources.getIdentifier(resName, "drawable", context.packageName)
        if (resId != 0) {
            return try {
                BitmapFactory.decodeResource(context.resources, resId)
            } catch (e: Exception) {
                Log.w(TAG, "Failed to decode report icon: $resName", e)
                null
            }
        }
        return getSpendwiseLogoBitmap(context)
    }

    fun initChannels(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

            val txChannel = NotificationChannel(
                CHANNEL_TRANSACTIONS,
                "Transaction Alerts",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Notifications for saved expenses, income, and review requests"
                enableVibration(true)
            }

            val reportsChannel = NotificationChannel(
                CHANNEL_REPORTS,
                "Expense Reports",
                NotificationManager.IMPORTANCE_DEFAULT
            ).apply {
                description = "Daily, weekly, and monthly financial summaries"
            }

            val alertsChannel = NotificationChannel(
                CHANNEL_ALERTS,
                "Budget & Smart Alerts",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Budget thresholds, high-value alerts, and duplicate warnings"
                enableVibration(true)
            }

            notificationManager.createNotificationChannels(listOf(txChannel, reportsChannel, alertsChannel))
        }
    }

    private fun getCategoryColor(slug: String?, transactionType: String?): Pair<Int, Int> {
        val isCredit = transactionType == "credit" || transactionType == "income"
        return when (slug?.lowercase()) {
            "food_dining" -> Pair(Color.parseColor("#E64A19"), Color.parseColor("#FFEBE5"))
            "travel" -> Pair(Color.parseColor("#0288D1"), Color.parseColor("#E1F5FE"))
            "shopping" -> Pair(Color.parseColor("#7B1FA2"), Color.parseColor("#F3E5F5"))
            "groceries" -> Pair(Color.parseColor("#2E7D32"), Color.parseColor("#E8F5E9"))
            "bills_recharge" -> Pair(Color.parseColor("#E65100"), Color.parseColor("#FFF3E0"))
            "entertainment" -> Pair(Color.parseColor("#C2185B"), Color.parseColor("#FCE4EC"))
            "health" -> Pair(Color.parseColor("#C62828"), Color.parseColor("#FFEBEE"))
            "finance" -> Pair(Color.parseColor("#283593"), Color.parseColor("#E8EAF6"))
            "education" -> Pair(Color.parseColor("#1565C0"), Color.parseColor("#E3F2FD"))
            "self_transfers" -> Pair(Color.parseColor("#37474F"), Color.parseColor("#ECEFF1"))
            "transfers" -> Pair(Color.parseColor("#D84315"), Color.parseColor("#FBE9E7"))
            "games" -> Pair(Color.parseColor("#4A148C"), Color.parseColor("#F3E5F5"))
            "salary" -> Pair(Color.parseColor("#053B18"), Color.parseColor("#E8F5E9"))
            "bank_deposit" -> Pair(Color.parseColor("#004D40"), Color.parseColor("#E0F2F1"))
            "business" -> Pair(Color.parseColor("#1B5E20"), Color.parseColor("#E8F5E9"))
            "interest" -> Pair(Color.parseColor("#E65100"), Color.parseColor("#FFF8E1"))
            "ac_transfer" -> Pair(Color.parseColor("#006064"), Color.parseColor("#E0F7FA"))
            "bill_payment" -> Pair(Color.parseColor("#00838F"), Color.parseColor("#E0F7FA"))
            "credit" -> Pair(Color.parseColor("#00796B"), Color.parseColor("#E0F2F1"))
            "investment" -> Pair(Color.parseColor("#1A237E"), Color.parseColor("#E8EAF6"))
            "loan" -> Pair(Color.parseColor("#3E2723"), Color.parseColor("#EFEBE9"))
            "recharge" -> Pair(Color.parseColor("#00838F"), Color.parseColor("#E0F7FA"))
            "refund" -> Pair(Color.parseColor("#00695C"), Color.parseColor("#E0F2F1"))
            "reimbursement" -> Pair(Color.parseColor("#33691E"), Color.parseColor("#F1F8E9"))
            "rewards" -> Pair(Color.parseColor("#FF6F00"), Color.parseColor("#FFF8E1"))
            else -> if (isCredit) {
                Pair(Color.parseColor("#00796B"), Color.parseColor("#E0F2F1"))
            } else {
                Pair(Color.parseColor("#424242"), Color.parseColor("#EEEEEE"))
            }
        }
    }

    private fun createCircularBadge(glyphBitmap: Bitmap, bgColor: Int, borderColor: Int): Bitmap {
        val size = 192
        val output = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(output)

        // Draw soft circular background
        val bgPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = bgColor
            style = Paint.Style.FILL
        }
        val radius = size / 2f
        canvas.drawCircle(radius, radius, radius - 2f, bgPaint)

        // Draw category border ring
        val borderPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = borderColor
            style = Paint.Style.STROKE
            strokeWidth = 3.5f
        }
        canvas.drawCircle(radius, radius, radius - 3.5f, borderPaint)

        // Center the category glyph (fills 74% of the circle)
        val glyphSize = (size * 0.74f).toInt()
        val scaledGlyph = Bitmap.createScaledBitmap(glyphBitmap, glyphSize, glyphSize, true)
        val left = (size - glyphSize) / 2f
        val top = (size - glyphSize) / 2f
        canvas.drawBitmap(scaledGlyph, left, top, Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG))

        return output
    }

    private fun getCategoryBitmap(context: Context, slug: String?, transactionType: String?): Bitmap? {
        val cleanSlug = slug?.lowercase()?.replace("&", "")?.replace(" ", "_")?.replace("-", "_")?.replace("__", "_") ?: "other"
        val prefix = if (transactionType == "credit" || transactionType == "income") "ic_cat_inc_" else "ic_cat_exp_"
        val resName = prefix + cleanSlug
        val resId = context.resources.getIdentifier(resName, "drawable", context.packageName)
        val rawBitmap = if (resId != 0) {
            try {
                BitmapFactory.decodeResource(context.resources, resId)
            } catch (e: Exception) {
                Log.w(TAG, "Failed to decode category resource: $resName", e)
                null
            }
        } else {
            val fallbackName = prefix + "other"
            val fallbackId = context.resources.getIdentifier(fallbackName, "drawable", context.packageName)
            if (fallbackId != 0) {
                BitmapFactory.decodeResource(context.resources, fallbackId)
            } else null
        }

        if (rawBitmap == null) return null

        val (primaryColor, bgColor) = getCategoryColor(cleanSlug, transactionType)
        return createCircularBadge(rawBitmap, bgColor, primaryColor)
    }

    fun showSavedNotification(
        context: Context,
        id: Int,
        title: String,
        message: String,
        subtext: String? = null,
        categorySlug: String? = null,
        transactionType: String? = "debit"
    ) {
        initChannels(context)
        val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        val intent = context.packageManager.getLaunchIntentForPackage(context.packageName)?.apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
            putExtra("NOTIFICATION_ACTION", "VIEW_TRANSACTION")
            putExtra("TRANSACTION_ID", id)
        }
        val pendingIntent = PendingIntent.getActivity(
            context,
            id,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val largeIcon = getCategoryBitmap(context, categorySlug, transactionType)

        // Subtext only shown when expanded; app name remains preserved in header
        val bigTextStyle = NotificationCompat.BigTextStyle()
            .setBigContentTitle(title)
            .bigText(if (!subtext.isNullOrBlank()) "$message\n$subtext" else message)

        val builder = NotificationCompat.Builder(context, CHANNEL_TRANSACTIONS)
            .setSmallIcon(getSmallIconResId(context))
            .setContentTitle(title)
            .setContentText(message)
            .setStyle(bigTextStyle)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(pendingIntent)
            .setGroup("spendwise_transactions")
            .setAutoCancel(true)

        if (largeIcon != null) {
            builder.setLargeIcon(largeIcon)
        }

        notificationManager.notify(id, builder.build())
    }

    fun showReviewNotification(
        context: Context,
        id: Int,
        title: String,
        message: String,
        details: String,
        candidateJson: String,
        categorySlug: String? = null,
        transactionType: String? = "debit"
    ) {
        initChannels(context)
        val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        // Body Tap opens the app directly to review screen
        val openIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)?.apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
            putExtra("NOTIFICATION_ACTION", "REVIEW_TRANSACTION")
            putExtra("CANDIDATE_JSON", candidateJson)
            putExtra("NOTIFICATION_ID", id)
        }
        val openPendingIntent = PendingIntent.getActivity(
            context,
            id,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        // Action 1: Direct Save in background
        val saveIntent = Intent(context, TransactionActionReceiver::class.java).apply {
            action = TransactionActionReceiver.ACTION_SAVE
            putExtra(TransactionActionReceiver.EXTRA_NOTIFICATION_ID, id)
            putExtra(TransactionActionReceiver.EXTRA_CANDIDATE_JSON, candidateJson)
        }
        val savePendingIntent = PendingIntent.getBroadcast(
            context,
            id * 10 + 1,
            saveIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        // Action 2: Dismiss
        val dismissIntent = Intent(context, TransactionActionReceiver::class.java).apply {
            action = TransactionActionReceiver.ACTION_DISMISS
            putExtra(TransactionActionReceiver.EXTRA_NOTIFICATION_ID, id)
        }
        val dismissPendingIntent = PendingIntent.getBroadcast(
            context,
            id * 10 + 2,
            dismissIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val largeIcon = getCategoryBitmap(context, categorySlug, transactionType)

        val bigTextStyle = NotificationCompat.BigTextStyle()
            .setBigContentTitle(title)
            .bigText(details)

        val builder = NotificationCompat.Builder(context, CHANNEL_TRANSACTIONS)
            .setSmallIcon(getSmallIconResId(context))
            .setContentTitle(title)
            .setContentText(message)
            .setStyle(bigTextStyle)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(openPendingIntent)
            .setGroup("spendwise_transactions")
            .addAction(0, "Save", savePendingIntent)
            .addAction(0, "Dismiss", dismissPendingIntent)
            .setAutoCancel(true)

        if (largeIcon != null) {
            builder.setLargeIcon(largeIcon)
        }

        notificationManager.notify(id, builder.build())
    }

    fun showReportNotification(
        context: Context,
        id: Int,
        title: String,
        summary: String,
        details: String,
        reportType: String
    ) {
        initChannels(context)
        val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        // Main Tap opens Dashboard
        val mainIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)?.apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
            putExtra("NOTIFICATION_ACTION", "VIEW_REPORT")
            putExtra("REPORT_TYPE", reportType)
        }
        val mainPendingIntent = PendingIntent.getActivity(
            context,
            id,
            mainIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        // Interactive Action 1: View Analytics (Dashboard)
        val analyticsIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)?.apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
            putExtra("NOTIFICATION_ACTION", "VIEW_ANALYTICS")
            putExtra("REPORT_TYPE", reportType)
        }
        val analyticsPendingIntent = PendingIntent.getActivity(
            context,
            id * 10 + 1,
            analyticsIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        // Interactive Action 2: View Ledger (History)
        val ledgerIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)?.apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
            putExtra("NOTIFICATION_ACTION", "VIEW_HISTORY")
            putExtra("REPORT_TYPE", reportType)
        }
        val ledgerPendingIntent = PendingIntent.getActivity(
            context,
            id * 10 + 2,
            ledgerIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val reportIcon = getReportIconBitmap(context, reportType)

        val styledTitle = Html.fromHtml(title, Html.FROM_HTML_MODE_COMPACT)
        val styledSummary = Html.fromHtml(summary, Html.FROM_HTML_MODE_COMPACT)
        val styledDetails = Html.fromHtml(details, Html.FROM_HTML_MODE_COMPACT)

        val bigTextStyle = NotificationCompat.BigTextStyle()
            .setBigContentTitle(styledTitle)
            .bigText(styledDetails)

        val builder = NotificationCompat.Builder(context, CHANNEL_REPORTS)
            .setSmallIcon(getSmallIconResId(context))
            .setContentTitle(styledTitle)
            .setContentText(styledSummary)
            .setStyle(bigTextStyle)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setContentIntent(mainPendingIntent)
            .addAction(0, "View Analytics", analyticsPendingIntent)
            .addAction(0, "View Ledger", ledgerPendingIntent)
            .setAutoCancel(true)

        if (reportIcon != null) {
            builder.setLargeIcon(reportIcon)
        }

        notificationManager.notify(id, builder.build())
    }

    fun showAlertNotification(
        context: Context,
        id: Int,
        title: String,
        message: String,
        details: String? = null,
        alertType: String = "general"
    ) {
        initChannels(context)
        val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        val intent = context.packageManager.getLaunchIntentForPackage(context.packageName)?.apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
            putExtra("NOTIFICATION_ACTION", "VIEW_ALERT")
            putExtra("ALERT_TYPE", alertType)
        }
        val pendingIntent = PendingIntent.getActivity(
            context,
            id,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val spendwiseLogo = getSpendwiseLogoBitmap(context)

        val builder = NotificationCompat.Builder(context, CHANNEL_ALERTS)
            .setSmallIcon(getSmallIconResId(context))
            .setContentTitle(title)
            .setContentText(message)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)

        if (spendwiseLogo != null) {
            builder.setLargeIcon(spendwiseLogo)
        }

        if (!details.isNullOrBlank()) {
            builder.setStyle(
                NotificationCompat.BigTextStyle()
                    .setBigContentTitle(title)
                    .bigText(details)
            )
        }

        notificationManager.notify(id, builder.build())
    }
}
