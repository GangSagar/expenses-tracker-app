package com.expensetracker.notification

import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import com.expensetracker.bridge.MessageModule

class NotificationListener : NotificationListenerService() {

    companion object {
        private val WHITELISTED_PACKAGES = setOf(
            "com.google.android.apps.nbu.paisa",  // Google Pay
            "net.one97.paytm",                     // Paytm
            "com.phonepe.app",                     // PhonePe
            "in.amazon.mShop.android.shopping",    // Amazon Pay
            "com.whatsapp"                         // WhatsApp Pay
        )
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        sbn ?: return

        val packageName = sbn.packageName ?: return

        // Only process notifications from whitelisted payment apps
        if (packageName !in WHITELISTED_PACKAGES) return

        val extras = sbn.notification?.extras ?: return
        val title = extras.getCharSequence("android.title")?.toString() ?: ""
        val text = extras.getCharSequence("android.text")?.toString() ?: ""
        val bigText = extras.getCharSequence("android.bigText")?.toString()

        // Use bigText if available (more detailed), otherwise use text
        val body = bigText ?: text
        if (body.isBlank()) return

        Log.d("ExpenseTracker", "NotificationListener: Received notification from $packageName")

        MessageModule.emitMessageReceived(
            context = this,
            body = body,
            sender = packageName,
            source = "notification"
        )
    }
}
