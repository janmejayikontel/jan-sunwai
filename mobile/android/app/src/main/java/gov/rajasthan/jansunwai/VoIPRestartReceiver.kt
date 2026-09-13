package gov.rajasthan.jansunwai

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import androidx.core.content.ContextCompat

/**
 * VoIPRestartReceiver
 *
 * Automatically revives and restarts JanSunwaiVoIPService if the app is
 * swiped away from Recents, the task is killed, or the process is recycled.
 */
class VoIPRestartReceiver : BroadcastReceiver() {

    companion object {
        const val TAG = "VoIPRestartReceiver"
        const val ACTION_RESTART = "gov.rajasthan.jansunwai.ACTION_RESTART_VOIP"
    }

    override fun onReceive(context: Context, intent: Intent) {
        Log.i(TAG, "Received revival broadcast: ${intent.action}")

        val prefs = context.getSharedPreferences("jansunwai_voip_prefs", Context.MODE_PRIVATE)
        val phone = prefs.getString("phone", "") ?: ""
        val serverUrl = prefs.getString("server_url", "") ?: ""

        if (phone.isNotEmpty()) {
            JanSunwaiVoIPService.isInCall = false
            JanSunwaiVoIPService.stopActiveRinging()

            Log.i(TAG, "Reviving JanSunwaiVoIPService for $phone @ $serverUrl")
            val serviceIntent = Intent(context, JanSunwaiVoIPService::class.java).apply {
                action = JanSunwaiVoIPService.ACTION_START
                putExtra(JanSunwaiVoIPService.EXTRA_PHONE, phone)
                putExtra(JanSunwaiVoIPService.EXTRA_SERVER_URL, serverUrl)
            }

            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    ContextCompat.startForegroundService(context, serviceIntent)
                } else {
                    context.startService(serviceIntent)
                }
                Log.i(TAG, "JanSunwaiVoIPService revived successfully")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to revive JanSunwaiVoIPService", e)
            }
        }
    }
}
