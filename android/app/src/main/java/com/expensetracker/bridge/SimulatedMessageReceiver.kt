package com.expensetracker.bridge

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * BroadcastReceiver for emulator and automated testing.
 * Accepts `com.expensetracker.SIMULATE_MESSAGE` intent via ADB:
 *
 * adb shell am broadcast -a com.expensetracker.SIMULATE_MESSAGE \
 *   --es sender "com.google.android.apps.nbu.paisa" \
 *   --es body "Paid ₹350 to Starbucks on Google Pay" \
 *   --es source "notification"
 */
class SimulatedMessageReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != ACTION_SIMULATE_MESSAGE) return

        val body = intent.getStringExtra(EXTRA_BODY) ?: return
        if (body.isBlank()) return

        val rawSender = intent.getStringExtra(EXTRA_SENDER) ?: "SIMULATED_SENDER"
        val rawSource = intent.getStringExtra(EXTRA_SOURCE) ?: if (rawSender.contains('.')) "notification" else "sms"
        val lat = extractDoubleExtra(intent, EXTRA_LATITUDE)
        val lng = extractDoubleExtra(intent, EXTRA_LONGITUDE)

        Log.d("ExpenseTracker", "SimulatedMessageReceiver: Received $rawSource message from $rawSender: $body")

        MessageModule.emitMessageReceived(
            context = context,
            body = body,
            sender = rawSender,
            source = rawSource,
            latitude = lat,
            longitude = lng
        )
    }

    private fun extractDoubleExtra(intent: Intent, key: String): Double? {
        if (!intent.hasExtra(key)) return null
        return when (val v = intent.extras?.get(key)) {
            is Number -> v.toDouble()
            is String -> v.toDoubleOrNull()
            else -> null
        }
    }

    companion object {
        const val ACTION_SIMULATE_MESSAGE = "com.expensetracker.SIMULATE_MESSAGE"
        const val EXTRA_BODY = "body"
        const val EXTRA_SENDER = "sender"
        const val EXTRA_SOURCE = "source"
        const val EXTRA_LATITUDE = "latitude"
        const val EXTRA_LONGITUDE = "longitude"
    }
}

