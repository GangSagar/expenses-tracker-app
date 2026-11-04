package com.expensetracker.bridge

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import android.net.Uri
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.expensetracker.notification.NotificationHelper
import com.expensetracker.notification.ReportScheduler

class MessageModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val EVENT_NAME = "onMessageReceived"
        private var instance: MessageModule? = null

        fun emitMessageReceived(
            context: Context,
            body: String,
            sender: String,
            source: String,
            latitude: Double? = null,
            longitude: Double? = null
        ) {
            val module = instance
            val reactContext = module?.reactApplicationContext

            // Use explicitly provided coordinates if supplied; otherwise query device GPS/Network automatically
            val loc = if (latitude != null && longitude != null) {
                com.expensetracker.location.LocationData(latitude, longitude)
            } else {
                com.expensetracker.location.LocationHelper.getCurrentLocation(context)
            }

            val isForeground = reactContext != null &&
                    reactContext.hasActiveReactInstance() &&
                    reactContext.lifecycleState == com.facebook.react.common.LifecycleState.RESUMED

            if (!isForeground) {
                Log.d("ExpenseTracker", "App not in foreground. Starting MessageHeadlessService for $sender.")
                try {
                    val headlessIntent = Intent(context, MessageHeadlessService::class.java).apply {
                        putExtra("body", body)
                        putExtra("sender", sender)
                        putExtra("source", source)
                        if (loc != null) {
                            putExtra("latitude", loc.latitude)
                            putExtra("longitude", loc.longitude)
                            loc.accuracy?.let { putExtra("accuracy", it) }
                            loc.timestamp?.let { putExtra("locationTimestamp", it.toDouble()) }
                        }
                    }
                    com.facebook.react.HeadlessJsTaskService.acquireWakeLockNow(context)
                    context.startService(headlessIntent)
                } catch (e: Exception) {
                    Log.e("ExpenseTracker", "Failed to start headless task service; saving to pending queue", e)
                    PendingMessageStore.saveMessage(
                        context = context,
                        body = body,
                        sender = sender,
                        source = source,
                        latitude = loc?.latitude,
                        longitude = loc?.longitude,
                        accuracy = loc?.accuracy,
                        locationTimestamp = loc?.timestamp
                    )
                }
                return
            }

            Log.d("ExpenseTracker", "React context active. Emitting message from $sender directly.")
            val params = Arguments.createMap().apply {
                putString("body", body)
                putString("sender", sender)
                putString("source", source)
                if (loc != null) {
                    val locationMap = Arguments.createMap().apply {
                        putDouble("latitude", loc.latitude)
                        putDouble("longitude", loc.longitude)
                        loc.accuracy?.let { putDouble("accuracy", it) }
                        loc.timestamp?.let { putDouble("timestamp", it.toDouble()) }
                    }
                    putMap("location", locationMap)
                }
            }

            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(EVENT_NAME, params)
        }

        fun handleNewIntent(intent: Intent?) {
            intent ?: return
            val action = intent.getStringExtra("NOTIFICATION_ACTION") ?: return
            val reportType = intent.getStringExtra("REPORT_TYPE")
            val transactionId = intent.getIntExtra("TRANSACTION_ID", -1)
            val candidateJson = intent.getStringExtra("CANDIDATE_JSON")
            val alertType = intent.getStringExtra("ALERT_TYPE")

            val map = Arguments.createMap().apply {
                putString("action", action)
                if (reportType != null) putString("reportType", reportType)
                if (transactionId != -1) putInt("transactionId", transactionId)
                if (candidateJson != null) putString("candidateJson", candidateJson)
                if (alertType != null) putString("alertType", alertType)
            }

            val module = instance
            val reactContext = module?.reactApplicationContext
            if (reactContext != null && reactContext.hasActiveReactInstance()) {
                reactContext
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    .emit("onNotificationAction", map)
            }
        }

        fun emitTransactionSavedFromNotification(context: Context, jsonString: String) {
            val module = instance
            val reactContext = module?.reactApplicationContext
            if (reactContext != null && reactContext.hasActiveReactInstance()) {
                val params = Arguments.createMap().apply {
                    putString("transactionJson", jsonString)
                }
                reactContext
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    .emit("onTransactionSavedFromNotification", params)
            }
        }
    }

    init {
        instance = this
    }

    override fun getName(): String = "MessageModule"

    @ReactMethod
    fun getPendingMessages(promise: Promise) {
        try {
            val context = reactApplicationContext
            val jsonString = PendingMessageStore.getAndClearMessages(context)
            promise.resolve(jsonString)
        } catch (e: Exception) {
            promise.reject("FETCH_ERROR", "Failed to fetch pending messages", e)
        }
    }

    @ReactMethod
    fun addAllowedNotificationPackage(packageName: String, promise: Promise) {
        try {
            val context = reactApplicationContext
            com.expensetracker.notification.NotificationListener.addAllowedPackage(context, packageName)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ADD_PACKAGE_ERROR", "Failed to add allowed package", e)
        }
    }

    @ReactMethod
    fun removeAllowedNotificationPackage(packageName: String, promise: Promise) {
        try {
            val context = reactApplicationContext
            com.expensetracker.notification.NotificationListener.removeAllowedPackage(context, packageName)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("REMOVE_PACKAGE_ERROR", "Failed to remove allowed package", e)
        }
    }

    @ReactMethod
    fun getAllowedNotificationPackages(promise: Promise) {
        try {
            val context = reactApplicationContext
            val packages = com.expensetracker.notification.NotificationListener.getAllowedPackages(context)
            val array = Arguments.createArray()
            packages.forEach { array.pushString(it) }
            promise.resolve(array)
        } catch (e: Exception) {
            promise.reject("GET_PACKAGES_ERROR", "Failed to fetch allowed packages", e)
        }
    }

    @ReactMethod
    fun showExpenseNotification(title: String, message: String) {
        val context = reactApplicationContext ?: return
        NotificationHelper.showSavedNotification(
            context = context,
            id = System.currentTimeMillis().toInt(),
            title = title,
            message = message
        )
    }

    @ReactMethod
    fun showSavedNotification(options: ReadableMap) {
        val context = reactApplicationContext ?: return
        val id = if (options.hasKey("id")) options.getInt("id") else System.currentTimeMillis().toInt()
        val title = if (options.hasKey("title")) options.getString("title") ?: "Transaction Saved" else "Transaction Saved"
        val message = if (options.hasKey("message")) options.getString("message") ?: "" else ""
        val subtext = if (options.hasKey("subtext")) options.getString("subtext") else null
        val categorySlug = if (options.hasKey("categorySlug")) options.getString("categorySlug") else null
        val transactionType = if (options.hasKey("transactionType")) options.getString("transactionType") else "debit"

        NotificationHelper.showSavedNotification(
            context = context,
            id = id,
            title = title,
            message = message,
            subtext = subtext,
            categorySlug = categorySlug,
            transactionType = transactionType
        )
    }

    @ReactMethod
    fun showReviewNotification(options: ReadableMap) {
        val context = reactApplicationContext ?: return
        val id = if (options.hasKey("id")) options.getInt("id") else System.currentTimeMillis().toInt()
        val title = if (options.hasKey("title")) options.getString("title") ?: "Review Needed" else "Review Needed"
        val message = if (options.hasKey("message")) options.getString("message") ?: "" else ""
        val details = if (options.hasKey("details")) options.getString("details") ?: message else message
        val candidateJson = if (options.hasKey("candidateJson")) options.getString("candidateJson") ?: "{}" else "{}"
        val categorySlug = if (options.hasKey("categorySlug")) options.getString("categorySlug") else null
        val transactionType = if (options.hasKey("transactionType")) options.getString("transactionType") else "debit"

        NotificationHelper.showReviewNotification(
            context = context,
            id = id,
            title = title,
            message = message,
            details = details,
            candidateJson = candidateJson,
            categorySlug = categorySlug,
            transactionType = transactionType
        )
    }

    @ReactMethod
    fun showReportNotification(options: ReadableMap) {
        val context = reactApplicationContext ?: return
        val id = if (options.hasKey("id")) options.getInt("id") else 9001
        val title = if (options.hasKey("title")) options.getString("title") ?: "Expense Report" else "Expense Report"
        val summary = if (options.hasKey("summary")) options.getString("summary") ?: "" else ""
        val details = if (options.hasKey("details")) options.getString("details") ?: summary else summary
        val reportType = if (options.hasKey("reportType")) options.getString("reportType") ?: "daily" else "daily"

        NotificationHelper.showReportNotification(
            context = context,
            id = id,
            title = title,
            summary = summary,
            details = details,
            reportType = reportType
        )
    }

    @ReactMethod
    fun showAlertNotification(options: ReadableMap) {
        val context = reactApplicationContext ?: return
        val id = if (options.hasKey("id")) options.getInt("id") else System.currentTimeMillis().toInt()
        val title = if (options.hasKey("title")) options.getString("title") ?: "Alert" else "Alert"
        val message = if (options.hasKey("message")) options.getString("message") ?: "" else ""
        val details = if (options.hasKey("details")) options.getString("details") else null
        val alertType = if (options.hasKey("alertType")) options.getString("alertType") ?: "general" else "general"

        NotificationHelper.showAlertNotification(
            context = context,
            id = id,
            title = title,
            message = message,
            details = details,
            alertType = alertType
        )
    }

    @ReactMethod
    fun scheduleFinancialReports() {
        val context = reactApplicationContext ?: return
        ReportScheduler.scheduleAll(context)
    }

    @ReactMethod
    fun getInitialNotificationAction(promise: Promise) {
        val activity = reactApplicationContext.currentActivity
        val currentIntent = activity?.intent
        val action = currentIntent?.getStringExtra("NOTIFICATION_ACTION")
        val reportType = currentIntent?.getStringExtra("REPORT_TYPE")
        val transactionId = currentIntent?.getIntExtra("TRANSACTION_ID", -1) ?: -1
        val candidateJson = currentIntent?.getStringExtra("CANDIDATE_JSON")
        val alertType = currentIntent?.getStringExtra("ALERT_TYPE")

        val map = Arguments.createMap()
        if (action != null) {
            map.putString("action", action)
            if (reportType != null) {
                map.putString("reportType", reportType)
            }
            if (transactionId != -1) {
                map.putInt("transactionId", transactionId)
            }
            if (candidateJson != null) {
                map.putString("candidateJson", candidateJson)
            }
            if (alertType != null) {
                map.putString("alertType", alertType)
            }
            currentIntent.removeExtra("NOTIFICATION_ACTION")
            currentIntent.removeExtra("REPORT_TYPE")
            currentIntent.removeExtra("TRANSACTION_ID")
            currentIntent.removeExtra("CANDIDATE_JSON")
            currentIntent.removeExtra("ALERT_TYPE")
        }
        promise.resolve(map)
    }

    @ReactMethod
    fun fetchPastMessages(startTimestamp: Double, promise: Promise) {
        try {
            val context = reactApplicationContext ?: throw Exception("React context is null")
            val uri = Uri.parse("content://sms/inbox")
            val projection = arrayOf("body", "address", "date")
            val selection = "date >= ?"
            val selectionArgs = arrayOf(startTimestamp.toLong().toString())
            val sortOrder = "date ASC"

            val cursor = context.contentResolver.query(uri, projection, selection, selectionArgs, sortOrder)
            val jsonArray = org.json.JSONArray()

            cursor?.use { c ->
                val bodyIndex = c.getColumnIndexOrThrow("body")
                val addressIndex = c.getColumnIndexOrThrow("address")
                val dateIndex = c.getColumnIndexOrThrow("date")

                while (c.moveToNext()) {
                    val body = c.getString(bodyIndex)
                    val sender = c.getString(addressIndex)
                    val date = c.getLong(dateIndex)

                    // Filter out purely numeric senders (e.g. standard phone numbers)
                    // Transactional SMS in India always contain letters.
                    if (sender != null && (sender.matches(Regex(".*[a-zA-Z].*")) || sender.matches(Regex("^\\d{3,9}$")))) {
                        val obj = org.json.JSONObject().apply {
                            put("body", body)
                            put("sender", sender)
                            put("source", "sms")
                            put("timestamp", date.toDouble())
                        }
                        jsonArray.put(obj)
                    }
                }
            }

            promise.resolve(jsonArray.toString())
        } catch (e: Exception) {
            promise.reject("FETCH_ERROR", "Failed to query historical SMS messages", e)
        }
    }

    @ReactMethod
    fun fetchPastMessagesPaged(startTimestamp: Double, pageSize: Int, offset: Int, promise: Promise) {
        try {
            val context = reactApplicationContext ?: throw Exception("React context is null")
            val uri = Uri.parse("content://sms/inbox")
            val projection = arrayOf("body", "address", "date")
            val selection = "date >= ?"
            val selectionArgs = arrayOf(startTimestamp.toLong().toString())
            // Use sortOrder with LIMIT/OFFSET to page results
            val sortOrder = "date ASC LIMIT $pageSize OFFSET $offset"

            val cursor = context.contentResolver.query(uri, projection, selection, selectionArgs, sortOrder)
            val jsonArray = org.json.JSONArray()

            cursor?.use { c ->
                val bodyIndex = c.getColumnIndexOrThrow("body")
                val addressIndex = c.getColumnIndexOrThrow("address")
                val dateIndex = c.getColumnIndexOrThrow("date")

                while (c.moveToNext()) {
                    val body = c.getString(bodyIndex)
                    val sender = c.getString(addressIndex)
                    val date = c.getLong(dateIndex)
                    // Allow senders that contain letters or short numeric shortcodes (3-6 digits)
                    if (sender != null && (sender.matches(Regex(".*[a-zA-Z].*")) || sender.matches(Regex("^\\d{3,9}$")))) {
                        val obj = org.json.JSONObject().apply {
                            put("body", body)
                            put("sender", sender)
                            put("source", "sms")
                            put("timestamp", date.toDouble())
                        }
                        jsonArray.put(obj)
                    }
                }
            }

            val responseObj = org.json.JSONObject().apply {
                put("messages", jsonArray)
                put("cursorCount", cursor?.count ?: 0)
            }
            promise.resolve(responseObj.toString())
        } catch (e: Exception) {
            promise.reject("FETCH_ERROR", "Failed to query historical SMS messages (paged)", e)
        }
    }

    @ReactMethod
    fun fetchPastMessagesSince(startTimestamp: Double, pageSize: Int, afterTimestamp: Double, promise: Promise) {
        try {
            val context = reactApplicationContext ?: throw Exception("React context is null")
            val uri = Uri.parse("content://sms/inbox")
            val projection = arrayOf("body", "address", "date")

            // Build selection depending on whether afterTimestamp is provided
            val selection: String
            val selectionArgs: Array<String>
            if (afterTimestamp <= 0.0) {
                selection = "date >= ?"
                selectionArgs = arrayOf(startTimestamp.toLong().toString())
            } else {
                selection = "date >= ? AND date > ?"
                selectionArgs = arrayOf(startTimestamp.toLong().toString(), afterTimestamp.toLong().toString())
            }

            val sortOrder = "date ASC LIMIT $pageSize"

            val cursor = context.contentResolver.query(uri, projection, selection, selectionArgs, sortOrder)
            val jsonArray = org.json.JSONArray()

            cursor?.use { c ->
                val bodyIndex = c.getColumnIndexOrThrow("body")
                val addressIndex = c.getColumnIndexOrThrow("address")
                val dateIndex = c.getColumnIndexOrThrow("date")

                while (c.moveToNext()) {
                    val body = c.getString(bodyIndex)
                    val sender = c.getString(addressIndex)
                    val date = c.getLong(dateIndex)

                    if (sender != null && (sender.matches(Regex(".*[a-zA-Z].*")) || sender.matches(Regex("^\\d{3,9}$")))) {
                        val obj = org.json.JSONObject().apply {
                            put("body", body)
                            put("sender", sender)
                            put("source", "sms")
                            put("timestamp", date.toDouble())
                        }
                        jsonArray.put(obj)
                    }
                }
            }

            promise.resolve(jsonArray.toString())
        } catch (e: Exception) {
            promise.reject("FETCH_ERROR", "Failed to query historical SMS messages (since)", e)
        }
    }

    @ReactMethod
    fun addListener(eventName: String) {
        // Required for RN event emitter
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // Required for RN event emitter
    }
}
