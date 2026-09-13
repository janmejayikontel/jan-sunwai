package gov.rajasthan.jansunwai

import android.content.Context
import android.content.Intent
import android.os.Build
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
    fun getPendingCall(promise: Promise) {
        val callData = pendingIncomingCallJson ?: JanSunwaiVoIPService.lastReceivedCallData
        pendingIncomingCallJson = null
        promise.resolve(callData)
    }
}
