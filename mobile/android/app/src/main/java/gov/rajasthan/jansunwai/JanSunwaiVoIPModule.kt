package gov.rajasthan.jansunwai

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
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
    }

    override fun getName(): String = MODULE_NAME

    @ReactMethod
    fun startService(phone: String, serverUrl: String, promise: Promise) {
        try {
            Log.i("JanSunwaiVoIPModule", "Starting native VoIP service for $phone @ $serverUrl")
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
    fun dismissCall(callId: String?, promise: Promise) {
        try {
            JanSunwaiVoIPService.dismissCall(callId)
            pendingIncomingCallJson = null
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("DISMISS_CALL_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun getPendingCall(promise: Promise) {
        val callData = pendingIncomingCallJson ?: JanSunwaiVoIPService.lastReceivedCallData
        pendingIncomingCallJson = null
        JanSunwaiVoIPService.lastReceivedCallData = null // One-shot consumption so it never rings again on leave!
        promise.resolve(callData)
    }
}
