package com.expensetracker.bridge

import android.content.Intent
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

/**
 * Headless JS Task Service for background message ingestion.
 * Wakes up the React Native JavaScript runtime when the application is swiped away
 * or terminated, allowing autonomous parsing, SQLite persistence, and smart alert dispatching.
 */
class MessageHeadlessService : HeadlessJsTaskService() {

    override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? {
        val extras = intent?.extras ?: return null
        return HeadlessJsTaskConfig(
            "MessageHeadlessTask",
            Arguments.fromBundle(extras),
            20000,
            true
        )
    }
}
