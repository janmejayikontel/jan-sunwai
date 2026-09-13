package gov.rajasthan.jansunwai

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.Ringtone
import android.media.RingtoneManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log
import androidx.core.app.NotificationCompat
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class JanSunwaiVoIPService : Service() {

    companion object {
        const val TAG = "JanSunwaiVoIP"
        const val STANDBY_CHANNEL_ID = "jansunwai_standby_channel"
        const val CALL_CHANNEL_ID = "jansunwai_incoming_call_channel"
        const val NOTIFICATION_ID_STANDBY = 1001
        const val NOTIFICATION_ID_CALL = 9999

        const val ACTION_START = "gov.rajasthan.jansunwai.ACTION_START"
        const val ACTION_STOP = "gov.rajasthan.jansunwai.ACTION_STOP"
        const val ACTION_DECLINE = "gov.rajasthan.jansunwai.ACTION_DECLINE"
        const val ACTION_ACCEPT = "gov.rajasthan.jansunwai.ACTION_ACCEPT"

        const val EXTRA_PHONE = "extra_phone"
        const val EXTRA_SERVER_URL = "extra_server_url"
        const val EXTRA_CALL_DATA = "extra_call_data"
        const val EXTRA_CALL_ID = "extra_call_id"

        var isServiceRunning = false
        var currentRingingCallId: String? = null
        var lastReceivedCallData: String? = null

        private var instance: JanSunwaiVoIPService? = null

        fun stopActiveRinging() {
            instance?.stopRinging()
        }
    }

    private var okHttpClient: OkHttpClient? = null
    private var webSocket: WebSocket? = null
    private var userPhone: String = ""
    private var serverUrl: String = ""

    private var ringtone: Ringtone? = null
    private var vibrator: Vibrator? = null
    private var wakeLock: PowerManager.WakeLock? = null

    private val handler = Handler(Looper.getMainLooper())
    private var pollRunnable: Runnable? = null
    private var isCallRinging = false

    override fun onCreate() {
        super.onCreate()
        instance = this
        Log.i(TAG, "JanSunwaiVoIPService created")

        val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = powerManager.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP,
            "JanSunwai::VoIPWakeLock"
        )

        vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val vibratorManager = getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager
            vibratorManager.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
        }

        createNotificationChannels()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action ?: ACTION_START

        when (action) {
            ACTION_STOP -> {
                Log.i(TAG, "Stopping VoIP service")
                stopForegroundService()
                return START_NOT_STICKY
            }
            ACTION_DECLINE -> {
                val callId = intent?.getStringExtra(EXTRA_CALL_ID)
                handleDeclineCall(callId)
                return START_STICKY
            }
            ACTION_ACCEPT -> {
                stopRinging()
                // Launch MainActivity
                val launchIntent = Intent(this, MainActivity::class.java).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                    putExtra("action", "accept_call")
                    putExtra(EXTRA_CALL_DATA, lastReceivedCallData)
                }
                startActivity(launchIntent)
                return START_STICKY
            }
            ACTION_START -> {
                val prefs = getSharedPreferences("jansunwai_voip_prefs", Context.MODE_PRIVATE)
                val phone = intent?.getStringExtra(EXTRA_PHONE) ?: prefs.getString("phone", "") ?: ""
                val srv = intent?.getStringExtra(EXTRA_SERVER_URL) ?: prefs.getString("server_url", "") ?: ""

                if (phone.isNotEmpty()) {
                    userPhone = phone
                    serverUrl = srv
                    prefs.edit().putString("phone", userPhone).putString("server_url", serverUrl).apply()

                    startForeground(NOTIFICATION_ID_STANDBY, createStandbyNotification())
                    isServiceRunning = true

                    connectWebSocket()
                    startPollingFallback()
                } else {
                    Log.w(TAG, "No phone number provided, stopping VoIP service")
                    stopSelf()
                }
            }
        }

        return START_STICKY
    }

    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

            // 1. Standby ongoing channel (low importance)
            val standbyChannel = NotificationChannel(
                STANDBY_CHANNEL_ID,
                "Sampark Lite Service Status",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Keeps Sampark Lite ready to receive official hearing calls"
                setShowBadge(false)
            }
            notificationManager.createNotificationChannel(standbyChannel)

            // 2. Incoming call channel (high importance with vibration & sound)
            val callChannel = NotificationChannel(
                CALL_CHANNEL_ID,
                "Incoming Video Hearings",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Alerts for incoming official video hearings from the District Collector"
                setSound(
                    RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE),
                    AudioAttributes.Builder()
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                        .build()
                )
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 1000, 1000, 1000)
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            }
            notificationManager.createNotificationChannel(callChannel)
        }
    }

    private fun createStandbyNotification(): Notification {
        val launchIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            this, 0, launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, STANDBY_CHANNEL_ID)
            .setContentTitle("🏛️ संपर्क लाइट (Sampark Lite)")
            .setContentText("Active & ready to receive hearing calls (${userPhone})")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    private fun connectWebSocket() {
        if (userPhone.isEmpty() || serverUrl.isEmpty()) return

        try {
            val cleanBase = serverUrl.trim().trimEnd('/')
            val wsProto = if (cleanBase.startsWith("https")) "wss://" else "ws://"
            val cleanHost = cleanBase.replace(Regex("^https?://"), "")
            val wsUrl = "${wsProto}${cleanHost}/ws?phone=${userPhone}"

            Log.i(TAG, "Connecting native WebSocket: $wsUrl")

            okHttpClient?.dispatcher?.executorService?.shutdown()
            okHttpClient = OkHttpClient.Builder()
                .readTimeout(0, TimeUnit.MILLISECONDS)
                .pingInterval(15, TimeUnit.SECONDS)
                .build()

            val request = Request.Builder().url(wsUrl).build()
            webSocket = okHttpClient!!.newWebSocket(request, object : WebSocketListener() {
                override fun onOpen(webSocket: WebSocket, response: Response) {
                    Log.i(TAG, "Native WebSocket connected as $userPhone")
                }

                override fun onMessage(webSocket: WebSocket, text: String) {
                    Log.d(TAG, "Native WebSocket message received: $text")
                    try {
                        val json = JSONObject(text)
                        val type = json.optString("type")
                        if (type == "incoming_call") {
                            val data = json.optJSONObject("data") ?: json
                            handleIncomingCall(data.toString())
                        } else if (type == "call_ended" || type == "call_declined") {
                            stopRinging()
                        }
                    } catch (e: Exception) {
                        Log.w(TAG, "Error parsing WebSocket message", e)
                    }
                }

                override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                    Log.i(TAG, "WebSocket closed: $reason. Reconnecting in 5s...")
                    scheduleReconnect()
                }

                override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                    Log.w(TAG, "WebSocket failure: ${t.message}. Reconnecting in 5s...")
                    scheduleReconnect()
                }
            })
        } catch (e: Exception) {
            Log.e(TAG, "Failed to connect native WebSocket", e)
            scheduleReconnect()
        }
    }

    private fun scheduleReconnect() {
        handler.removeCallbacksAndMessages("reconnect")
        handler.postDelayed({
            if (isServiceRunning) {
                connectWebSocket()
            }
        }, 5000)
    }

    private fun startPollingFallback() {
        pollRunnable?.let { handler.removeCallbacks(it) }
        pollRunnable = object : Runnable {
            override fun run() {
                if (!isServiceRunning) return
                checkIncomingCallHttp()
                handler.postDelayed(this, 3500)
            }
        }
        handler.postDelayed(pollRunnable!!, 3500)
    }

    private fun checkIncomingCallHttp() {
        if (serverUrl.isEmpty() || userPhone.isEmpty() || isCallRinging) return

        Thread {
            try {
                val cleanBase = serverUrl.trim().trimEnd('/')
                val checkUrl = "${cleanBase}/api/calls/check-incoming/${userPhone}"
                val client = OkHttpClient.Builder()
                    .connectTimeout(3, TimeUnit.SECONDS)
                    .readTimeout(3, TimeUnit.SECONDS)
                    .build()
                val req = Request.Builder().url(checkUrl).build()
                val res = client.newCall(req).execute()
                if (res.isSuccessful) {
                    val body = res.body?.string() ?: ""
                    val json = JSONObject(body)
                    if (json.optBoolean("hasIncomingCall", false)) {
                        val callObj = json.optJSONObject("incomingCall")
                        if (callObj != null && !isCallRinging) {
                            handler.post {
                                handleIncomingCall(callObj.toString())
                            }
                        }
                    }
                }
                res.close()
            } catch (e: Exception) {
                // silent background polling
            }
        }.start()
    }

    fun handleIncomingCall(callJsonString: String) {
        if (isCallRinging) return
        isCallRinging = true
        lastReceivedCallData = callJsonString

        try {
            val json = JSONObject(callJsonString)
            val callId = json.optString("callId")
            val grievanceId = json.optString("grievanceId", "Hearing")
            val callerName = json.optString("callerName", "District Collector")
            val callerDesig = json.optString("callerDesignation", "Presiding Officer")
            val title = json.optString("title", "Jan Sunwai Video Hearing")

            currentRingingCallId = callId
            Log.i(TAG, "TRIGGERING INCOMING CALL RING: $callerName for case $grievanceId")

            // 1. Wake screen up
            wakeLock?.let {
                if (!it.isHeld) {
                    it.acquire(60000)
                }
            }

            // 2. Play ringtone
            try {
                val ringtoneUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
                ringtone = RingtoneManager.getRingtone(applicationContext, ringtoneUri)
                ringtone?.play()
            } catch (e: Exception) {
                Log.w(TAG, "Failed to play ringtone", e)
            }

            // 3. Start continuous vibration
            try {
                val pattern = longArrayOf(0, 1000, 1000, 1000, 1000)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    vibrator?.vibrate(VibrationEffect.createWaveform(pattern, 0))
                } else {
                    @Suppress("DEPRECATION")
                    vibrator?.vibrate(pattern, 0)
                }
            } catch (e: Exception) {
                Log.w(TAG, "Failed to vibrate", e)
            }

            // 4. Build Full-Screen Intent to launch MainActivity over lock screen
            val fullScreenIntent = Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                putExtra("action", "incoming_call")
                putExtra(EXTRA_CALL_DATA, callJsonString)
            }
            val fullScreenPendingIntent = PendingIntent.getActivity(
                this, 101, fullScreenIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            // Accept intent
            val acceptIntent = Intent(this, JanSunwaiVoIPService::class.java).apply {
                action = ACTION_ACCEPT
                putExtra(EXTRA_CALL_ID, callId)
                putExtra(EXTRA_CALL_DATA, callJsonString)
            }
            val acceptPendingIntent = PendingIntent.getService(
                this, 102, acceptIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            // Decline intent
            val declineIntent = Intent(this, JanSunwaiVoIPService::class.java).apply {
                action = ACTION_DECLINE
                putExtra(EXTRA_CALL_ID, callId)
            }
            val declinePendingIntent = PendingIntent.getService(
                this, 103, declineIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            val notification = NotificationCompat.Builder(this, CALL_CHANNEL_ID)
                .setContentTitle("🏛️ $callerName ($callerDesig)")
                .setContentText("📞 Incoming Video Hearing: #$grievanceId\n$title")
                .setSmallIcon(R.mipmap.ic_launcher)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setFullScreenIntent(fullScreenPendingIntent, true)
                .setContentIntent(fullScreenPendingIntent)
                .setOngoing(true)
                .setAutoCancel(false)
                .addAction(R.mipmap.ic_launcher, "📞 ACCEPT", acceptPendingIntent)
                .addAction(R.mipmap.ic_launcher, "❌ DECLINE", declinePendingIntent)
                .setStyle(
                    NotificationCompat.BigTextStyle()
                        .bigText("$callerName ($callerDesig) is calling you into the official Jan Sunwai video hearing for Case #$grievanceId.")
                )
                .build()

            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.notify(NOTIFICATION_ID_CALL, notification)

            // Also launch fullScreenIntent directly to display call immediately
            startActivity(fullScreenIntent)

            // 60-second auto-dismiss if not answered
            handler.postDelayed({
                if (isCallRinging && currentRingingCallId == callId) {
                    Log.i(TAG, "Call ringing timed out after 60s")
                    stopRinging()
                }
            }, 60000)

        } catch (e: Exception) {
            Log.e(TAG, "Error handling incoming call", e)
            stopRinging()
        }
    }

    fun stopRinging() {
        if (!isCallRinging) return
        isCallRinging = false
        currentRingingCallId = null

        try {
            ringtone?.stop()
            ringtone = null
        } catch (e: Exception) {
            // ignore
        }

        try {
            vibrator?.cancel()
        } catch (e: Exception) {
            // ignore
        }

        try {
            wakeLock?.let {
                if (it.isHeld) it.release()
            }
        } catch (e: Exception) {
            // ignore
        }

        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.cancel(NOTIFICATION_ID_CALL)
        Log.i(TAG, "Stopped ringing and cleared call notification")
    }

    private fun handleDeclineCall(callId: String?) {
        stopRinging()
        if (callId.isNullOrEmpty() || serverUrl.isEmpty() || userPhone.isEmpty()) return

        Thread {
            try {
                val cleanBase = serverUrl.trim().trimEnd('/')
                val url = "${cleanBase}/api/calls/${callId}/respond"
                val body = JSONObject().apply {
                    put("phone", userPhone)
                    put("action", "decline")
                }.toString()

                val client = OkHttpClient()
                val req = Request.Builder()
                    .url(url)
                    .post(body.toRequestBody("application/json".toMediaTypeOrNull()))
                    .build()
                client.newCall(req).execute().close()
                Log.i(TAG, "Declined call $callId on server")
            } catch (e: Exception) {
                Log.w(TAG, "Error sending decline to server", e)
            }
        }.start()
    }

    private fun stopForegroundService() {
        isServiceRunning = false
        stopRinging()

        pollRunnable?.let { handler.removeCallbacks(it) }
        handler.removeCallbacksAndMessages(null)

        try {
            webSocket?.close(1000, "Service stopped")
            okHttpClient?.dispatcher?.executorService?.shutdown()
        } catch (e: Exception) {
            // ignore
        }

        stopForeground(true)
        stopSelf()
    }

    override fun onDestroy() {
        super.onDestroy()
        stopForegroundService()
        instance = null
        Log.i(TAG, "JanSunwaiVoIPService destroyed")
    }
}
