package com.expensetracker.notification

import android.content.Context
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import com.expensetracker.bridge.MessageModule

class NotificationListener : NotificationListenerService() {

    companion object {
        const val PREFS_NAME = "ExpenseTrackerNotificationPrefs"
        const val KEY_CUSTOM_PACKAGES = "custom_notification_packages"

        val WHITELISTED_PACKAGES = setOf(
            "com.google.android.apps.nbu.paisa",   // Google Pay
            "net.one97.paytm",                      // Paytm
            "com.phonepe.app",                      // PhonePe
            "in.amazon.mShop.android.shopping",     // Amazon Pay
            "com.whatsapp",                         // WhatsApp Pay
            "in.org.npci.upiapp",                   // BHIM UPI (BHIMUPI)
            "com.google.android.apps.messaging",    // Google Messages
            "com.samsung.android.messaging",        // Samsung Messages
            "com.android.mms",                      // AOSP SMS
            "com.dreamplug.androidapp"              // CRED
        )

        fun isPackageAllowed(context: Context, packageName: String): Boolean {
            if (packageName in WHITELISTED_PACKAGES) return true
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val custom = prefs.getStringSet(KEY_CUSTOM_PACKAGES, emptySet()) ?: emptySet()
            return packageName in custom
        }

        fun addAllowedPackage(context: Context, packageName: String) {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val current = (prefs.getStringSet(KEY_CUSTOM_PACKAGES, emptySet()) ?: emptySet()).toMutableSet()
            current.add(packageName)
            prefs.edit().putStringSet(KEY_CUSTOM_PACKAGES, current).apply()
        }

        fun removeAllowedPackage(context: Context, packageName: String) {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val current = (prefs.getStringSet(KEY_CUSTOM_PACKAGES, emptySet()) ?: emptySet()).toMutableSet()
            current.remove(packageName)
            prefs.edit().putStringSet(KEY_CUSTOM_PACKAGES, current).apply()
        }

        fun getAllowedPackages(context: Context): Set<String> {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val custom = prefs.getStringSet(KEY_CUSTOM_PACKAGES, emptySet()) ?: emptySet()
            return WHITELISTED_PACKAGES + custom
        }
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        sbn ?: return

        val packageName = sbn.packageName ?: return

        // Only process notifications from whitelisted or user-allowed payment/messaging apps
        if (!isPackageAllowed(this, packageName)) return

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
