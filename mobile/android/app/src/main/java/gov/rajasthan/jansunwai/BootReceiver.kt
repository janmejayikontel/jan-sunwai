package gov.rajasthan.jansunwai

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import androidx.core.content.ContextCompat

/**
 * BootReceiver
 *
 * Automatically restores and restarts the JanSunwaiVoIPService when:
 * 1. The device boots up (ACTION_BOOT_COMPLETED, QUICKBOOT_POWERON)
 * 2. The app is updated or package replaced (ACTION_MY_PACKAGE_REPLACED)
 *
 * This guarantees that citizens and government employees receive incoming hearing
 * calls even if they restarted their phone and haven't manually opened the app yet.
 */
class BootReceiver : BroadcastReceiver() {

    companion object {
        const val TAG = "JanSunwaiBootReceiver"
    }

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        Log.i(TAG, "Received broadcast action: $action")

        if (action == Intent.ACTION_BOOT_COMPLETED ||
            action == "android.intent.action.QUICKBOOT_POWERON" ||
            action == "com.htc.intent.action.QUICKBOOT_POWERON" ||
            action == Intent.ACTION_MY_PACKAGE_REPLACED
        ) {
            val prefs = context.getSharedPreferences("jansunwai_voip_prefs", Context.MODE_PRIVATE)
            val phone = prefs.getString("phone", "") ?: ""
            val serverUrl = prefs.getString("server_url", "") ?: ""

            if (phone.isNotEmpty()) {
                Log.i(TAG, "Restoring JanSunwaiVoIPService for $phone @ $serverUrl after $action")
                val serviceIntent = Intent(context, JanSunwaiVoIPService::class.java).apply {
                    this.action = JanSunwaiVoIPService.ACTION_START
                    putExtra(JanSunwaiVoIPService.EXTRA_PHONE, phone)
                    putExtra(JanSunwaiVoIPService.EXTRA_SERVER_URL, serverUrl)
                }

                try {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        ContextCompat.startForegroundService(context, serviceIntent)
                    } else {
                        context.startService(serviceIntent)
                    }
                    Log.i(TAG, "JanSunwaiVoIPService successfully dispatched on boot")
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to start JanSunwaiVoIPService on boot", e)
                }
            } else {
                Log.i(TAG, "No saved user phone found in prefs; skipping VoIP service startup")
            }
        }
    }
}
