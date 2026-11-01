package com.expensetracker.notification

import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.database.sqlite.SQLiteDatabase
import android.util.Log
import com.expensetracker.bridge.MessageModule
import org.json.JSONObject

class TransactionActionReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "TxActionReceiver"
        const val ACTION_SAVE = "com.expensetracker.ACTION_SAVE_TRANSACTION"
        const val ACTION_DISMISS = "com.expensetracker.ACTION_DISMISS_TRANSACTION"
        const val EXTRA_NOTIFICATION_ID = "extra_notification_id"
        const val EXTRA_CANDIDATE_JSON = "extra_candidate_json"
    }

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        val notificationId = intent.getIntExtra(EXTRA_NOTIFICATION_ID, 0)
        val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        // Cancel the review notification immediately
        if (notificationId != 0) {
            notificationManager.cancel(notificationId)
        }

        when (action) {
            ACTION_SAVE -> {
                val candidateJsonStr = intent.getStringExtra(EXTRA_CANDIDATE_JSON)
                if (candidateJsonStr.isNullOrBlank()) {
                    Log.e(TAG, "Cannot save transaction: Candidate JSON is missing")
                    return
                }

                try {
                    val candidate = JSONObject(candidateJsonStr)
                    val dbPath = context.getDatabasePath("expense_tracker.db")
                    if (!dbPath.exists()) {
                        Log.e(TAG, "Database file does not exist at ${dbPath.absolutePath}")
                        return
                    }

                    val db = SQLiteDatabase.openDatabase(dbPath.absolutePath, null, SQLiteDatabase.OPEN_READWRITE)
                    val amount = candidate.optDouble("amount", 0.0)
                    val merchant = candidate.optString("merchant", "Unknown")
                    val category = candidate.optString("category", "Other")
                    val confidence = candidate.optDouble("confidence", 1.0)
                    val timestamp = if (candidate.has("timestamp")) candidate.optLong("timestamp") else System.currentTimeMillis()
                    val source = candidate.optString("source", "sms")
                    val rawMessage = candidate.optString("rawMessage", candidate.optString("raw_message", ""))
                    val transactionType = candidate.optString("transactionType", candidate.optString("transaction_type", "debit"))
                    val account = if (candidate.has("account")) candidate.optString("account") else null
                    val bank = if (candidate.has("bank")) candidate.optString("bank") else null
                    val paymentMode = candidate.optString("paymentMode", candidate.optString("payment_mode", "unknown"))
                    val referenceId = when {
                        candidate.has("referenceId") -> candidate.optString("referenceId")
                        candidate.has("reference_id") -> candidate.optString("reference_id")
                        else -> null
                    }

                    val values = ContentValues().apply {
                        put("amount", amount)
                        put("merchant", merchant)
                        put("category", category)
                        put("confidence", confidence)
                        put("timestamp", timestamp)
                        put("source", source)
                        put("raw_message", rawMessage)
                        put("transaction_type", transactionType)
                        account?.let { put("account", it) }
                        bank?.let { put("bank", it) }
                        put("payment_mode", paymentMode)
                        put("is_duplicate", 0)
                        put("is_invalid", 0)
                        referenceId?.let { put("reference_id", it) }
                    }

                    val insertedId = db.insert("expenses", null, values)
                    db.close()
                    Log.i(TAG, "Transaction successfully saved from notification action! ID: $insertedId")

                    // Notify React Native if active
                    candidate.put("id", insertedId)
                    MessageModule.emitTransactionSavedFromNotification(context, candidate.toString())

                    // Show confirmed saved notification
                    val arrow = if (transactionType == "credit" || transactionType == "income") "↙" else "↗"
                    val formattedAmount = String.format("%.2f", amount)
                    val title = "$arrow ₹$formattedAmount"
                    val message = "$merchant • $category"
                    val subtext = "Transaction confirmed and saved to history"

                    NotificationHelper.showSavedNotification(
                        context = context,
                        id = if (insertedId > 0) insertedId.toInt() else notificationId,
                        title = title,
                        message = message,
                        subtext = subtext,
                        categorySlug = category,
                        transactionType = transactionType
                    )
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to save transaction from notification action", e)
                }
            }
            ACTION_DISMISS -> {
                Log.d(TAG, "Review notification $notificationId dismissed by user.")
            }
        }
    }
}
