package com.expensetracker.bridge

import android.app.KeyguardManager
import android.content.Context
import android.os.Build
import android.view.WindowManager
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.UiThreadUtil
import java.util.concurrent.atomic.AtomicBoolean

class SecurityModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), LifecycleEventListener {

    private var activeBiometricPrompt: BiometricPrompt? = null
    private val isAuthenticating = AtomicBoolean(false)

    init {
        reactContext.addLifecycleEventListener(this)
    }

    override fun getName(): String = "SecurityModule"

    override fun onHostResume() {
        // Activity resumed
    }

    override fun onHostPause() {
        // Cancel active biometric prompt to prevent FragmentManager / BiometricService crashes
        cancelCurrentAuthentication()
    }

    override fun onHostDestroy() {
        cancelCurrentAuthentication()
    }

    private fun cancelCurrentAuthentication() {
        UiThreadUtil.runOnUiThread {
            try {
                if (isAuthenticating.getAndSet(false)) {
                    activeBiometricPrompt?.cancelAuthentication()
                    activeBiometricPrompt = null
                }
            } catch (e: Exception) {
                // Ignore cancellation errors during teardown
            }
        }
    }

    @ReactMethod
    fun isDeviceAuthAvailable(promise: Promise) {
        try {
            val context = reactApplicationContext
            val biometricManager = BiometricManager.from(context)
            val keyguardManager = context.getSystemService(Context.KEYGUARD_SERVICE) as? KeyguardManager
            val isDeviceSecure = keyguardManager?.isDeviceSecure ?: false

            val canBiometric = biometricManager.canAuthenticate(
                BiometricManager.Authenticators.BIOMETRIC_STRONG
            )

            val canDevice = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                try {
                    biometricManager.canAuthenticate(
                        BiometricManager.Authenticators.BIOMETRIC_STRONG or BiometricManager.Authenticators.DEVICE_CREDENTIAL
                    )
                } catch (e: Exception) {
                    if (isDeviceSecure) BiometricManager.BIOMETRIC_SUCCESS else canBiometric
                }
            } else {
                if (isDeviceSecure) BiometricManager.BIOMETRIC_SUCCESS else canBiometric
            }

            val isAvailable = (canDevice == BiometricManager.BIOMETRIC_SUCCESS) || isDeviceSecure
            val hasBiometrics = (canBiometric == BiometricManager.BIOMETRIC_SUCCESS)

            val map = Arguments.createMap().apply {
                putBoolean("isAvailable", isAvailable)
                putBoolean("hasBiometrics", hasBiometrics)
                putBoolean("isDeviceSecure", isDeviceSecure)
            }
            promise.resolve(map)
        } catch (e: Exception) {
            promise.reject("E_CHECK_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun authenticate(title: String, subtitle: String, promise: Promise) {
        UiThreadUtil.runOnUiThread {
            val activity = reactApplicationContext.currentActivity as? FragmentActivity
            if (activity == null || activity.isFinishing || activity.isDestroyed) {
                promise.reject("E_NO_ACTIVITY", "Current activity is not available or finishing")
                return@runOnUiThread
            }

            if (activity.supportFragmentManager.isStateSaved || activity.supportFragmentManager.isDestroyed) {
                promise.reject("E_STATE_SAVED", "Cannot show biometric prompt while activity state is saved or destroyed")
                return@runOnUiThread
            }

            // If an authentication is already in progress, cancel it cleanly before starting new one
            if (isAuthenticating.get()) {
                try {
                    activeBiometricPrompt?.cancelAuthentication()
                } catch (ignored: Exception) {}
            }
            isAuthenticating.set(true)

            val isPromiseSettled = AtomicBoolean(false)
            val executor = ContextCompat.getMainExecutor(activity)
            val callback = object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    super.onAuthenticationSucceeded(result)
                    isAuthenticating.set(false)
                    activeBiometricPrompt = null
                    if (isPromiseSettled.compareAndSet(false, true)) {
                        promise.resolve(true)
                    }
                }

                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    super.onAuthenticationError(errorCode, errString)
                    isAuthenticating.set(false)
                    activeBiometricPrompt = null
                    if (isPromiseSettled.compareAndSet(false, true)) {
                        promise.reject(errorCode.toString(), errString.toString())
                    }
                }

                override fun onAuthenticationFailed() {
                    super.onAuthenticationFailed()
                    // Biometric hardware failed matching, prompt stays open for retry
                }
            }

            try {
                val biometricPrompt = BiometricPrompt(activity, executor, callback)
                activeBiometricPrompt = biometricPrompt
                val promptBuilder = BiometricPrompt.PromptInfo.Builder()
                    .setTitle(if (title.isNotBlank()) title else "Unlock SpendWise")
                    .setSubtitle(if (subtitle.isNotBlank()) subtitle else "Authenticate using biometrics or phone screen lock")

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    promptBuilder.setAllowedAuthenticators(
                        BiometricManager.Authenticators.BIOMETRIC_STRONG or BiometricManager.Authenticators.DEVICE_CREDENTIAL
                    )
                } else {
                    @Suppress("DEPRECATION")
                    promptBuilder.setDeviceCredentialAllowed(true)
                }

                val promptInfo = promptBuilder.build()
                biometricPrompt.authenticate(promptInfo)
            } catch (e: Exception) {
                isAuthenticating.set(false)
                activeBiometricPrompt = null
                if (isPromiseSettled.compareAndSet(false, true)) {
                    promise.reject("E_PROMPT_FAILED", e.message, e)
                }
            }
        }
    }

    @ReactMethod
    fun cancelAuthentication(promise: Promise) {
        cancelCurrentAuthentication()
        promise.resolve(true)
    }

    @ReactMethod
    fun setSecureFlag(enable: Boolean, promise: Promise) {
        UiThreadUtil.runOnUiThread {
            try {
                val activity = reactApplicationContext.currentActivity
                if (activity != null && !activity.isFinishing && !activity.isDestroyed) {
                    if (enable) {
                        activity.window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
                    } else {
                        activity.window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
                    }
                    promise.resolve(true)
                } else {
                    promise.resolve(false)
                }
            } catch (e: Exception) {
                promise.reject("E_SECURE_FLAG", e.message, e)
            }
        }
    }
}
