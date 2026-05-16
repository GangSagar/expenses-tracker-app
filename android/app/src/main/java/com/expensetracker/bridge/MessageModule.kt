package com.expensetracker.bridge

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

class MessageModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val EVENT_NAME = "onMessageReceived"
        private var instance: MessageModule? = null

        fun emitMessageReceived(context: Context, body: String, sender: String, source: String) {
            val module = instance
            val reactContext = module?.reactApplicationContext

            if (reactContext == null || !reactContext.hasActiveReactInstance()) {
                Log.d("ExpenseTracker", "React context inactive. Queuing message from $sender.")
                PendingMessageStore.saveMessage(context, body, sender, source)
                return
            }

            Log.d("ExpenseTracker", "React context active. Emitting message from $sender directly.")
            val params = Arguments.createMap().apply {
                putString("body", body)
                putString("sender", sender)
                putString("source", source)
            }

            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(EVENT_NAME, params)
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
    fun showExpenseNotification(title: String, message: String) {
        val context = reactApplicationContext ?: return
        val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val channelId = "expense_tracker_channel"

        // Create the NotificationChannel, but only on API 26+ because
        // the NotificationChannel class is new and not in the support library
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val name = "Expense Tracker Alerts"
            val descriptionText = "Notifications for uncategorized expenses"
            val importance = NotificationManager.IMPORTANCE_HIGH
            val channel = NotificationChannel(channelId, name, importance).apply {
                description = descriptionText
            }
            // Register the channel with the system
            notificationManager.createNotificationChannel(channel)
        }

        // Create an explicit intent for an Activity in your app
        val intent = context.packageManager.getLaunchIntentForPackage(context.packageName)?.apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        }
        val pendingIntent: PendingIntent = PendingIntent.getActivity(
            context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val builder = NotificationCompat.Builder(context, channelId)
            .setSmallIcon(context.resources.getIdentifier("ic_launcher", "mipmap", context.packageName))
            .setContentTitle(title)
            .setContentText(message)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)

        notificationManager.notify(System.currentTimeMillis().toInt(), builder.build())
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
