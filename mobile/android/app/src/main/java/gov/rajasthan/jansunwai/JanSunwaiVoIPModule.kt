package gov.rajasthan.jansunwai

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.util.Log
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class JanSunwaiVoIPModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val MODULE_NAME = "JanSunwaiVoIP"
        var pendingIncomingCallJson: String? = null
        private var instance: JanSunwaiVoIPModule? = null

        fun emitIncomingCall(callJson: String) {
            try {
                instance?.reactContext
                    ?.getJSModule(com.facebook.react.modules.core.DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    ?.emit("onIncomingCall", callJson)
                Log.i(MODULE_NAME, "Successfully emitted onIncomingCall event to React Native: $callJson")
            } catch (e: Exception) {
                Log.w(MODULE_NAME, "Failed to emit onIncomingCall event: ${e.message}")
            }
        }
    }

    init {
        instance = this
    }

    override fun getName(): String = MODULE_NAME

    @ReactMethod
    fun addListener(eventName: String) {
        // Required for React Native NativeEventEmitter
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // Required for React Native NativeEventEmitter
    }

    @ReactMethod
    fun startService(phone: String, serverUrl: String, promise: Promise) {
        try {
            Log.i("JanSunwaiVoIPModule", "Starting native VoIP service for $phone @ $serverUrl")

            // Write to SharedPreferences synchronously with commit() so BootReceiver and Service have it
            val prefs = reactContext.getSharedPreferences("jansunwai_voip_prefs", Context.MODE_PRIVATE)
            prefs.edit().putString("phone", phone).putString("server_url", serverUrl).commit()

            val intent = Intent(reactContext, JanSunwaiVoIPService::class.java).apply {
                action = JanSunwaiVoIPService.ACTION_START
                putExtra(JanSunwaiVoIPService.EXTRA_PHONE, phone)
                putExtra(JanSunwaiVoIPService.EXTRA_SERVER_URL, serverUrl)
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ContextCompat.startForegroundService(reactContext, intent)
            } else {
                reactContext.startService(intent)
            }

            promise.resolve(true)
        } catch (e: Exception) {
            Log.e("JanSunwaiVoIPModule", "Failed to start VoIP service", e)
            promise.reject("START_SERVICE_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun stopService(promise: Promise) {
        try {
            val prefs = reactContext.getSharedPreferences("jansunwai_voip_prefs", Context.MODE_PRIVATE)
            prefs.edit().remove("phone").commit()

            val intent = Intent(reactContext, JanSunwaiVoIPService::class.java).apply {
                action = JanSunwaiVoIPService.ACTION_STOP
            }
            reactContext.startService(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("STOP_SERVICE_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun stopRinging(promise: Promise) {
        try {
            CallOverlayManager.dismiss(reactContext)
            IncomingCallActivity.activeInstance?.finish()
            JanSunwaiVoIPService.stopActiveRinging()
            try {
                val intent = Intent(reactContext, JanSunwaiVoIPService::class.java).apply {
                    action = JanSunwaiVoIPService.ACTION_STOP_RINGING
                }
                reactContext.startService(intent)
            } catch (e: Exception) {
                // ignore
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("STOP_RINGING_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun setInCall(inCall: Boolean, promise: Promise) {
        try {
            if (inCall) {
                CallOverlayManager.dismiss(reactContext)
                IncomingCallActivity.activeInstance?.finish()
            }
            JanSunwaiVoIPService.setInCallState(inCall)
            val intent = Intent(reactContext, JanSunwaiVoIPService::class.java).apply {
                action = JanSunwaiVoIPService.ACTION_SET_IN_CALL
                putExtra(JanSunwaiVoIPService.EXTRA_IN_CALL, inCall)
            }
            reactContext.startService(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("SET_IN_CALL_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun checkOverlayPermission(promise: Promise) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            promise.resolve(Settings.canDrawOverlays(reactContext))
        } else {
            promise.resolve(true)
        }
    }

    @ReactMethod
    fun requestOverlayPermission(promise: Promise) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            try {
                if (!Settings.canDrawOverlays(reactContext)) {
                    val intent = Intent(
                        Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                        Uri.parse("package:" + reactContext.packageName)
                    ).apply {
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    reactContext.startActivity(intent)
                }
            } catch (e: Exception) {
                Log.w("JanSunwaiVoIPModule", "Error requesting overlay permission", e)
            }
        }
        promise.resolve(true)
    }

    @ReactMethod
    fun checkBatteryOptimization(promise: Promise) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            try {
                val powerManager = reactContext.getSystemService(Context.POWER_SERVICE) as? PowerManager
                val isIgnoring = powerManager?.isIgnoringBatteryOptimizations(reactContext.packageName) ?: true
                promise.resolve(isIgnoring)
            } catch (e: Exception) {
                promise.resolve(true)
            }
        } else {
            promise.resolve(true)
        }
    }

    @ReactMethod
    fun requestIgnoreBatteryOptimization(promise: Promise) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            try {
                val powerManager = reactContext.getSystemService(Context.POWER_SERVICE) as? PowerManager
                if (powerManager != null && !powerManager.isIgnoringBatteryOptimizations(reactContext.packageName)) {
                    val intent = Intent(
                        Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                        Uri.parse("package:" + reactContext.packageName)
                    ).apply {
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    reactContext.startActivity(intent)
                }
            } catch (e: Exception) {
                Log.w("JanSunwaiVoIPModule", "Error requesting battery optimization exemption", e)
            }
        }
        promise.resolve(true)
    }

    @ReactMethod
    fun checkFullScreenIntentPermission(promise: Promise) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) { // Android 14+
            try {
                val nm = reactContext.getSystemService(Context.NOTIFICATION_SERVICE) as? android.app.NotificationManager
                promise.resolve(nm?.canUseFullScreenIntent() ?: true)
            } catch (e: Exception) {
                promise.resolve(true)
            }
        } else {
            promise.resolve(true)
        }
    }

    @ReactMethod
    fun requestFullScreenIntentPermission(promise: Promise) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) { // Android 14+
            try {
                val nm = reactContext.getSystemService(Context.NOTIFICATION_SERVICE) as? android.app.NotificationManager
                if (nm?.canUseFullScreenIntent() == false) {
                    val intent = Intent(android.provider.Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT).apply {
                        data = Uri.parse("package:" + reactContext.packageName)
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    reactContext.startActivity(intent)
                }
            } catch (e: Exception) {
                Log.w("JanSunwaiVoIPModule", "Error requesting full screen intent permission", e)
            }
        }
        promise.resolve(true)
    }

    @ReactMethod
    fun dismissCall(callId: String?, promise: Promise) {
        try {
            CallOverlayManager.dismiss(reactContext)
            IncomingCallActivity.activeInstance?.finish()
            JanSunwaiVoIPService.dismissCall(callId)
            try {
                val intent = Intent(reactContext, JanSunwaiVoIPService::class.java).apply {
                    action = JanSunwaiVoIPService.ACTION_DISMISS_CALL
                    putExtra(JanSunwaiVoIPService.EXTRA_CALL_ID, callId)
                }
                reactContext.startService(intent)
            } catch (e: Exception) {
                // ignore
            }
            pendingIncomingCallJson = null
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("DISMISS_CALL_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun getPendingCall(promise: Promise) {
        val prefs = reactContext.getSharedPreferences("jansunwai_voip_prefs", Context.MODE_PRIVATE)
        val savedCall = prefs.getString("pending_accepted_call", null)
        if (savedCall != null) {
            prefs.edit().remove("pending_accepted_call").commit()
        }
        val callData = savedCall ?: pendingIncomingCallJson ?: JanSunwaiVoIPService.lastReceivedCallData
        pendingIncomingCallJson = null
        JanSunwaiVoIPService.lastReceivedCallData = null // One-shot consumption so it never rings again on leave!
        promise.resolve(callData)
    }
}
