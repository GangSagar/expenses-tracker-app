package com.expensetracker.sms

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import android.util.Log
import com.expensetracker.bridge.MessageModule

class SmsReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return

        val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent)
        if (messages.isNullOrEmpty()) return

        // Combine multi-part SMS
        val sender = messages[0].displayOriginatingAddress ?: return
        val body = messages.joinToString("") { it.messageBody ?: "" }

        if (body.isBlank()) return

        Log.d("ExpenseTracker", "SmsReceiver: Received SMS from $sender")

        // Send to React Native via the bridge (or queue if closed)
        MessageModule.emitMessageReceived(
            context = context,
            body = body,
            sender = sender,
            source = "sms"
        )
    }
}
