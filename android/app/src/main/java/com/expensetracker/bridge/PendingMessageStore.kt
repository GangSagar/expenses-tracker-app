package com.expensetracker.bridge

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject

object PendingMessageStore {
    private const val PREFS_NAME = "ExpenseTrackerPendingMessages"
    private const val KEY_MESSAGES = "pending_messages"

    private fun getPrefs(context: Context): SharedPreferences {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    }

    fun saveMessage(context: Context, body: String, sender: String, source: String) {
        try {
            val prefs = getPrefs(context)
            val currentMessagesStr = prefs.getString(KEY_MESSAGES, "[]")
            val messagesArray = JSONArray(currentMessagesStr)
            
            val newMessage = JSONObject().apply {
                put("body", body)
                put("sender", sender)
                put("source", source)
            }
            
            messagesArray.put(newMessage)
            
            prefs.edit().putString(KEY_MESSAGES, messagesArray.toString()).apply()
            Log.d("ExpenseTracker", "Saved pending message from $sender via $source to SharedPreferences")
        } catch (e: Exception) {
            Log.e("ExpenseTracker", "Failed to save message", e)
        }
    }

    fun getAndClearMessages(context: Context): String {
        val prefs = getPrefs(context)
        val currentMessagesStr = prefs.getString(KEY_MESSAGES, "[]") ?: "[]"
        
        // Clear immediately to avoid processing twice
        prefs.edit().remove(KEY_MESSAGES).apply()
        Log.d("ExpenseTracker", "Fetched and cleared pending messages queue: $currentMessagesStr")
        
        return currentMessagesStr
    }
}
