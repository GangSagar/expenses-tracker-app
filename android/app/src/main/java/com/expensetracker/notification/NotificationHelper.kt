package com.expensetracker.notification

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import com.expensetracker.MainActivity

object NotificationHelper {

    private const val TAG = "NotificationHelper"

    const val CHANNEL_TRANSACTIONS = "expense_tracker_transactions"
    const val CHANNEL_REPORTS = "expense_tracker_reports"
    const val CHANNEL_ALERTS = "expense_tracker_alerts"

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

    private fun getCategoryBitmap(context: Context, slug: String?, transactionType: String?): Bitmap? {
        val cleanSlug = slug?.lowercase()?.replace("&", "")?.replace(" ", "_")?.replace("-", "_")?.replace("__", "_") ?: "other"
        val prefix = if (transactionType == "credit" || transactionType == "income") "ic_cat_inc_" else "ic_cat_exp_"
        val resName = prefix + cleanSlug
        val resId = context.resources.getIdentifier(resName, "drawable", context.packageName)
        return if (resId != 0) {
            try {
                BitmapFactory.decodeResource(context.resources, resId)
            } catch (e: Exception) {
                Log.w(TAG, "Failed to decode category resource: $resName", e)
                null
            }
        } else {
            // Fallback to generic other icon if available
            val fallbackName = prefix + "other"
            val fallbackId = context.resources.getIdentifier(fallbackName, "drawable", context.packageName)
            if (fallbackId != 0) {
                BitmapFactory.decodeResource(context.resources, fallbackId)
            } else null
        }
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

        // Subtext only shown when expanded
        val bigTextStyle = NotificationCompat.BigTextStyle()
            .setBigContentTitle(title)
            .bigText(if (!subtext.isNullOrBlank()) "$message\n$subtext" else message)

        if (!subtext.isNullOrBlank()) {
            bigTextStyle.setSummaryText(subtext)
        }

        val builder = NotificationCompat.Builder(context, CHANNEL_TRANSACTIONS)
            .setSmallIcon(context.resources.getIdentifier("ic_launcher", "mipmap", context.packageName))
            .setContentTitle(title)
            .setContentText(message)
            .setStyle(bigTextStyle)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(pendingIntent)
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
            .setSummaryText("Confirmation Required")

        val builder = NotificationCompat.Builder(context, CHANNEL_TRANSACTIONS)
            .setSmallIcon(context.resources.getIdentifier("ic_launcher", "mipmap", context.packageName))
            .setContentTitle(title)
            .setContentText(message)
            .setStyle(bigTextStyle)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(openPendingIntent)
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

        val intent = context.packageManager.getLaunchIntentForPackage(context.packageName)?.apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
            putExtra("NOTIFICATION_ACTION", "VIEW_REPORT")
            putExtra("REPORT_TYPE", reportType)
        }
        val pendingIntent = PendingIntent.getActivity(
            context,
            id,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val bigTextStyle = NotificationCompat.BigTextStyle()
            .setBigContentTitle(title)
            .bigText(details)

        val builder = NotificationCompat.Builder(context, CHANNEL_REPORTS)
            .setSmallIcon(context.resources.getIdentifier("ic_launcher", "mipmap", context.packageName))
            .setContentTitle(title)
            .setContentText(summary)
            .setStyle(bigTextStyle)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setContentIntent(pendingIntent)
            .addAction(0, "More Details", pendingIntent)
            .setAutoCancel(true)

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

        val builder = NotificationCompat.Builder(context, CHANNEL_ALERTS)
            .setSmallIcon(context.resources.getIdentifier("ic_launcher", "mipmap", context.packageName))
            .setContentTitle(title)
            .setContentText(message)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)

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

