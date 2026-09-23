
package gov.rajasthan.jansunwai

import android.app.ActivityOptions
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.MediaPlayer
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
import androidx.core.app.Person
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
        const val CALL_CHANNEL_ID = "jansunwai_incoming_call_channel_v7"
        const val NOTIFICATION_ID_STANDBY = 1001
        const val NOTIFICATION_ID_CALL = 9999

        const val ACTION_START = "gov.rajasthan.jansunwai.ACTION_START"
        const val ACTION_STOP = "gov.rajasthan.jansunwai.ACTION_STOP"
        const val ACTION_DECLINE = "gov.rajasthan.jansunwai.ACTION_DECLINE"
        const val ACTION_ACCEPT = "gov.rajasthan.jansunwai.ACTION_ACCEPT"
        const val ACTION_STOP_RINGING = "gov.rajasthan.jansunwai.ACTION_STOP_RINGING"
        const val ACTION_SET_IN_CALL = "gov.rajasthan.jansunwai.ACTION_SET_IN_CALL"
        const val ACTION_DISMISS_CALL = "gov.rajasthan.jansunwai.ACTION_DISMISS_CALL"

        const val EXTRA_PHONE = "extra_phone"
        const val EXTRA_SERVER_URL = "extra_server_url"
        const val EXTRA_CALL_DATA = "extra_call_data"
        const val EXTRA_CALL_ID = "extra_call_id"
        const val EXTRA_IN_CALL = "extra_in_call"

        var isServiceRunning = false
        var isInCall = false
        var currentRingingCallId: String? = null
        var lastReceivedCallData: String? = null
        val dismissedCallIds: MutableSet<String> = java.util.concurrent.ConcurrentHashMap.newKeySet()

        private var instance: JanSunwaiVoIPService? = null

        fun stopActiveRinging() {
            instance?.stopRinging()
        }

        fun setInCallState(inCall: Boolean) {
            isInCall = inCall
            if (inCall) {
                stopActiveRinging()
                try {
                    instance?.let { s ->
                        CallOverlayManager.dismiss(s)
                    } ?: run {
                        CallOverlayManager.dismiss()
                    }
                    IncomingCallActivity.activeInstance?.finishAndRemoveTask()
                    IncomingCallActivity.activeInstance?.finish()
                } catch (e: Exception) {}
            }
            // Persist to SharedPrefs so service restarts (START_STICKY) restore correct state
            // This prevents re-ringing for an already-accepted call after service restart
            try {
                instance?.getSharedPreferences("jansunwai_voip_prefs", Context.MODE_PRIVATE)
                    ?.edit()?.putBoolean("is_in_call", inCall)?.commit()
            } catch (e: Exception) {
                Log.w(TAG, "Failed to persist isInCall=$inCall to SharedPrefs", e)
            }
        }

        fun dismissCall(callId: String?) {
            if (!callId.isNullOrBlank()) {
                val c = callId.trim().uppercase()
                dismissedCallIds.add(c)
                val clean = c.replace(Regex("^(HEARING_|JS-)"), "")
                if (clean.isNotEmpty()) {
                    dismissedCallIds.add(clean)
                    dismissedCallIds.add("JS-$clean")
                    dismissedCallIds.add("HEARING_$clean")
                }
                Log.i(TAG, "Dismissed callId added to blacklist: $c (total dismissed: ${dismissedCallIds.size})")
            }
            lastReceivedCallData = null
            try {
                CallOverlayManager.dismiss()
                IncomingCallActivity.activeInstance?.finishAndRemoveTask()
                IncomingCallActivity.activeInstance?.finish()
            } catch (e: Exception) {}
            try {
                instance?.let { s ->
                    val prefs = s.getSharedPreferences("jansunwai_voip_prefs", Context.MODE_PRIVATE)
                    prefs.edit()
                        .remove("last_call_json")
                        .remove("pending_accepted_call")
                        .remove("is_in_call")   // clear in-call flag so service won't suppress next call
                        .commit()
                }
            } catch (e: Exception) {
                // ignore
            }
            stopActiveRinging()
        }

        fun isCallDismissed(callId: String?, grievanceId: String?): Boolean {
            if (!callId.isNullOrBlank()) {
                val c = callId.trim().uppercase()
                if (dismissedCallIds.contains(c)) return true
                val clean = c.replace(Regex("^(HEARING_|JS-)"), "")
                if (dismissedCallIds.contains(clean) || dismissedCallIds.contains("JS-$clean") || dismissedCallIds.contains("HEARING_$clean")) return true
            }
            if (!grievanceId.isNullOrBlank()) {
                val g = grievanceId.trim().uppercase()
                if (dismissedCallIds.contains(g)) return true
                val cleanG = g.replace(Regex("^(HEARING_|JS-)"), "")
                if (dismissedCallIds.contains(cleanG) || dismissedCallIds.contains("JS-$cleanG") || dismissedCallIds.contains("HEARING_$cleanG")) return true
            }
            return false
        }
    }

    private var okHttpClient: OkHttpClient? = null
    private var webSocket: WebSocket? = null
    private var userPhone: String = ""
    private var serverUrl: String = ""

    private var mediaPlayer: MediaPlayer? = null
    private var vibrator: Vibrator? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private var standbyWakeLock: PowerManager.WakeLock? = null

    private val handler = Handler(Looper.getMainLooper())
    private var pollRunnable: Runnable? = null
    private var isCallRinging = false
    private var isWebSocketConnected = false
    @Volatile private var isPollingActive = false
    private var pollingThread: Thread? = null
    private var lastUrlFetchTime = 0L
    private var rateLimitBackoffUntil = 0L

    override fun onCreate() {
        super.onCreate()
        instance = this
        Log.i(TAG, "JanSunwaiVoIPService created")

        isCallRinging = false
        currentRingingCallId = null

        // Restore isInCall from SharedPrefs - prevents re-ringing after service restart
        // when user already accepted a call (START_STICKY restart bug)
        val prefs = getSharedPreferences("jansunwai_voip_prefs", Context.MODE_PRIVATE)
        isInCall = prefs.getBoolean("is_in_call", false)
        if (isInCall) {
            Log.i(TAG, "Service created: restoring isInCall=true from SharedPrefs (user is in a call)")
        } else {
            isInCall = false
        }

        if (userPhone.isEmpty()) {
            userPhone = prefs.getString("phone", "") ?: ""
        }
        if (serverUrl.isEmpty()) {
            serverUrl = prefs.getString("server_url", "") ?: ""
        }

        val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
        @Suppress("DEPRECATION")
        wakeLock = powerManager.newWakeLock(
            PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP or PowerManager.ON_AFTER_RELEASE,
            "JanSunwai::VoIPWakeLock"
        )

        try {
            standbyWakeLock = powerManager.newWakeLock(
                PowerManager.PARTIAL_WAKE_LOCK,
                "JanSunwai::VoIPStandbyWakeLock"
            ).apply {
                setReferenceCounted(false)
                acquire()
            }
            Log.i(TAG, "Acquired standby partial wake lock to keep background polling alive")
        } catch (e: Exception) {
            Log.w(TAG, "Failed to acquire standby partial wake lock", e)
        }

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

    override fun onTaskRemoved(rootIntent: Intent?) {
        super.onTaskRemoved(rootIntent)
        Log.i(TAG, "App task removed (swiped away) - keeping foreground VoIP service active")

        // Don't reset isInCall - check SharedPrefs to preserve accepted call state
        val taskPrefs = getSharedPreferences("jansunwai_voip_prefs", Context.MODE_PRIVATE)
        val savedInCall = taskPrefs.getBoolean("is_in_call", false)
        if (!savedInCall) {
            isInCall = false
        } else {
            Log.i(TAG, "onTaskRemoved: preserving isInCall=true (user still in a call)")
        }
        isCallRinging = false
        currentRingingCallId = null

        // Stop any active ringtone/vibration safely without dropping foreground status
        try { mediaPlayer?.stop(); mediaPlayer?.reset(); mediaPlayer?.release(); mediaPlayer = null } catch (e: Throwable) {}
        try { vibrator?.cancel() } catch (e: Throwable) {}

        // RE-AFFIRM FOREGROUND SERVICE IMMEDIATELY so OS never kills the background service
        try {
            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.cancel(NOTIFICATION_ID_CALL)
            startForeground(NOTIFICATION_ID_STANDBY, createStandbyNotification())
        } catch (e: Throwable) {
            Log.w(TAG, "Failed to reaffirm startForeground in onTaskRemoved", e)
        }

        isServiceRunning = true
        startPersistentPolling()
        if (!isWebSocketConnected) {
            connectWebSocket()
        }

        try {
            val restartIntent = Intent(applicationContext, VoIPRestartReceiver::class.java).apply {
                action = VoIPRestartReceiver.ACTION_RESTART
            }
            sendBroadcast(restartIntent)

            val pendingIntent = PendingIntent.getBroadcast(
                applicationContext,
                9091,
                restartIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            val alarmManager = getSystemService(Context.ALARM_SERVICE) as? android.app.AlarmManager
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                alarmManager?.setExactAndAllowWhileIdle(
                    android.app.AlarmManager.RTC_WAKEUP,
                    System.currentTimeMillis() + 1500,
                    pendingIntent
                )
            } else {
                alarmManager?.setExact(
                    android.app.AlarmManager.RTC_WAKEUP,
                    System.currentTimeMillis() + 1500,
                    pendingIntent
                )
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to schedule revival in onTaskRemoved", e)
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action ?: ACTION_START

        when (action) {
            ACTION_DISMISS_CALL -> {
                val callId = intent?.getStringExtra(EXTRA_CALL_ID)
                dismissCall(callId)
                return START_STICKY
            }
            ACTION_SET_IN_CALL -> {
                val inCall = intent?.getBooleanExtra(EXTRA_IN_CALL, false) ?: false
                setInCallState(inCall)
                return START_STICKY
            }
            ACTION_STOP_RINGING -> {
                Log.i(TAG, "ACTION_STOP_RINGING received")
                stopRinging()
                return START_STICKY
            }
            ACTION_STOP -> {
                Log.i(TAG, "Stopping VoIP service")
                stopForegroundService()
                return START_NOT_STICKY
            }
            ACTION_DECLINE -> {
                val callId = intent?.getStringExtra(EXTRA_CALL_ID)
                dismissCall(callId)
                handleDeclineCall(callId)
                return START_STICKY
            }
            ACTION_ACCEPT -> {
                val callId = intent?.getStringExtra(EXTRA_CALL_ID)
                val intentCallData = intent?.getStringExtra(EXTRA_CALL_DATA)
                Log.i(TAG, "ACTION_ACCEPT received for callId: $callId")
                setInCallState(true)
                stopRinging()
                CallOverlayManager.dismiss(applicationContext)
                try {
                    IncomingCallActivity.activeInstance?.finish()
                } catch (e: Exception) {
                    // ignore
                }

                val prefs = getSharedPreferences("jansunwai_voip_prefs", Context.MODE_PRIVATE)
                val raw = intentCallData?.takeIf { it.isNotBlank() }
                    ?: lastReceivedCallData?.takeIf { it.isNotBlank() }
                    ?: prefs.getString("last_call_json", "")
                    ?: ""

                val updatedCallData = try {
                    val j = if (raw.isNotEmpty()) JSONObject(raw) else JSONObject()
                    j.put("autoAccept", true)
                    if (!callId.isNullOrEmpty()) j.put("callId", callId)
                    if (serverUrl.isNotEmpty()) j.put("serverUrl", serverUrl)
                    if (userPhone.isNotEmpty()) j.put("userPhone", userPhone)
                    j.toString()
                } catch (e: Exception) {
                    raw
                }

                prefs.edit().putString("pending_accepted_call", updatedCallData).commit()
                JanSunwaiVoIPModule.pendingIncomingCallJson = updatedCallData

                // Use PendingIntent to launch MainActivity - this bypasses Android 10+ BAL restrictions
                // when triggered from a notification action (user interaction grants BAL token)
                val launchIntent = Intent(this, MainActivity::class.java).apply {
                    addFlags(
                        Intent.FLAG_ACTIVITY_NEW_TASK or
                        Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or
                        Intent.FLAG_ACTIVITY_SINGLE_TOP
                    )
                    putExtra("action", "accept_call")
                    putExtra(EXTRA_CALL_DATA, updatedCallData)
                }
                try {
                    val pendingLaunch = PendingIntent.getActivity(
                        this,
                        (System.currentTimeMillis() % 10000).toInt() + 5000,
                        launchIntent,
                        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                    )
                    pendingLaunch.send()
                } catch (e: Exception) {
                    Log.w(TAG, "PendingIntent.send failed for accept, trying startActivity: ${e.message}")
                    try { startActivity(launchIntent) } catch (e2: Exception) {
                        Log.e(TAG, "startActivity also failed for accept: ${e2.message}")
                    }
                }
                return START_STICKY
            }
            ACTION_START -> {
                isInCall = false
                isCallRinging = false
                currentRingingCallId = null

                val prefs = getSharedPreferences("jansunwai_voip_prefs", Context.MODE_PRIVATE)
                val phone = intent?.getStringExtra(EXTRA_PHONE)?.takeIf { it.isNotBlank() } ?: prefs.getString("phone", "") ?: ""
                val srv = intent?.getStringExtra(EXTRA_SERVER_URL)?.takeIf { it.isNotBlank() } ?: prefs.getString("server_url", "") ?: ""

                if (phone.isNotEmpty()) {
                    userPhone = phone
                    serverUrl = srv
                    prefs.edit().putString("phone", userPhone).putString("server_url", serverUrl).commit()

                    startForeground(NOTIFICATION_ID_STANDBY, createStandbyNotification())
                    isServiceRunning = true

                    connectWebSocket()
                    startPersistentPolling()
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

            // 2. Incoming call channel (high importance with ringtone and vibration for instant Heads-Up popup)
            val ringtoneUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
                ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
            val audioAttributes = AudioAttributes.Builder()
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                .build()

            val callChannel = NotificationChannel(
                CALL_CHANNEL_ID,
                "Incoming Video Hearings",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Alerts for incoming official video hearings from the District Collector"
                setSound(ringtoneUri, audioAttributes)
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 1000, 1000, 1000)
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
                setBypassDnd(true)
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

    private fun createInCallNotification(): Notification {
        val launchIntent = Intent(this, MainActivity::class.java).apply {
            addFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK or
                Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or
                Intent.FLAG_ACTIVITY_SINGLE_TOP
            )
        }
        val pendingIntent = PendingIntent.getActivity(
            this, 0, launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, STANDBY_CHANNEL_ID)
            .setContentTitle("📞 Official Video Hearing Active")
            .setContentText("Connected to Jan Sunwai hearing • Tap to return")
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
            val encodedPhone = java.net.URLEncoder.encode(userPhone, "UTF-8")
            val wsUrl = "${wsProto}${cleanHost}/ws?phone=${encodedPhone}"

            Log.i(TAG, "Connecting native WebSocket: $wsUrl")

            okHttpClient?.dispatcher?.executorService?.shutdown()
            okHttpClient = OkHttpClient.Builder()
                .readTimeout(0, TimeUnit.MILLISECONDS)
                .pingInterval(15, TimeUnit.SECONDS)
                .build()

            val request = Request.Builder()
                .url(wsUrl)
                .addHeader("Bypass-Tunnel-Reminder", "true")
                .build()
            webSocket = okHttpClient!!.newWebSocket(request, object : WebSocketListener() {
                override fun onOpen(webSocket: WebSocket, response: Response) {
                    Log.i(TAG, "Native WebSocket connected as $userPhone")
                    isWebSocketConnected = true
                }

                override fun onMessage(webSocket: WebSocket, text: String) {
                    Log.d(TAG, "Native WebSocket message received: $text")
                    try {
                        val json = JSONObject(text)
                        val type = json.optString("type")
                        if (type == "incoming_call") {
                            if (isInCall) {
                                Log.i(TAG, "Ignoring incoming call because user is currently in a call")
                                return
                            }
                            val data = json.optJSONObject("data") ?: json
                            val incomingCallId = data.optString("callId", "")
                            val grievanceId = data.optString("grievanceId", "")
                            if (isCallDismissed(incomingCallId, grievanceId)) {
                                Log.i(TAG, "Ignoring incoming call via WS — call $incomingCallId / case $grievanceId was already left/dismissed")
                                return
                            }
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
                    isWebSocketConnected = false
                    scheduleReconnect()
                }

                override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                    Log.w(TAG, "WebSocket failure: ${t.message}. Reconnecting in 5s...")
                    isWebSocketConnected = false
                    scheduleReconnect()
                }
            })
        } catch (e: Exception) {
            Log.e(TAG, "Failed to connect native WebSocket", e)
            isWebSocketConnected = false
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

    private fun startPersistentPolling() {
        if (isPollingActive && pollingThread?.isAlive == true) return
        isPollingActive = true
        pollingThread = Thread({
            Log.i(TAG, "Persistent background VoIP polling thread started")
            while (isPollingActive && isServiceRunning) {
                try {
                    // Check remote server URL every 60 seconds (or immediately if blank)
                    val now = System.currentTimeMillis()
                    if (now - lastUrlFetchTime > 60000L || serverUrl.isEmpty()) {
                        lastUrlFetchTime = now
                        fetchLatestServerUrl()
                    }

                    // Check incoming calls via HTTP (only if not rate limited)
                    if (System.currentTimeMillis() >= rateLimitBackoffUntil) {
                        checkIncomingCallHttp()
                    }

                    // If WebSocket is disconnected and service is active, attempt reconnection
                    if (!isWebSocketConnected && userPhone.isNotEmpty() && serverUrl.isNotEmpty()) {
                        handler.post {
                            if (!isWebSocketConnected && isServiceRunning) {
                                connectWebSocket()
                            }
                        }
                    }
                } catch (e: Throwable) {
                    Log.w(TAG, "Error in persistent background polling loop", e)
                }

                try {
                    // When WebSocket is connected, incoming calls arrive instantly (0ms) via WS push!
                    // If WS is disconnected, poll every 4s for rapid incoming call detection.
                    val sleepMs = if (isWebSocketConnected) 20000L else 4000L
                    Thread.sleep(sleepMs)
                } catch (ie: InterruptedException) {
                    break
                }
            }
            Log.i(TAG, "Persistent background VoIP polling thread stopped")
        }, "VoIP-BackgroundPoller").apply {
            isDaemon = true
            start()
        }
    }

    private fun fetchLatestServerUrl() {
        try {
            val client = OkHttpClient.Builder()
                .connectTimeout(4, TimeUnit.SECONDS)
                .readTimeout(4, TimeUnit.SECONDS)
                .build()
            val req = Request.Builder()
                .url("https://raw.githubusercontent.com/janmejayikontel/jan-sunwai/main/server-url.txt?nocache=" + System.currentTimeMillis())
                .header("Cache-Control", "no-cache")
                .build()
            val res = client.newCall(req).execute()
            if (res.isSuccessful) {
                val newUrl = res.body?.string()?.trim() ?: ""
                if (newUrl.startsWith("http") && newUrl != serverUrl) {
                    Log.i(TAG, "Discovered updated server URL from GitHub: $newUrl (old: $serverUrl)")
                    serverUrl = newUrl
                    val prefs = getSharedPreferences("jansunwai_voip_prefs", Context.MODE_PRIVATE)
                    prefs.edit().putString("server_url", newUrl).commit()
                    handler.post {
                        connectWebSocket()
                    }
                }
            }
            res.close()
        } catch (e: Throwable) {
            // Silently ignore if offline
        }
    }

    private fun checkIncomingCallHttp() {
        if (isInCall || serverUrl.isEmpty() || userPhone.isEmpty() || isCallRinging) return

        try {
            val cleanBase = serverUrl.trim().trimEnd('/')
            val encodedPhone = java.net.URLEncoder.encode(userPhone, "UTF-8")
            val checkUrl = "${cleanBase}/api/calls/check-incoming/${encodedPhone}"
            val client = OkHttpClient.Builder()
                .connectTimeout(2500, TimeUnit.MILLISECONDS)
                .readTimeout(2500, TimeUnit.MILLISECONDS)
                .build()
            val req = Request.Builder()
                .url(checkUrl)
                .addHeader("Bypass-Tunnel-Reminder", "true")
                .build()
            val res = client.newCall(req).execute()
            if (res.code == 429) {
                Log.w(TAG, "Cloudflare tunnel rate limit (429) hit, pausing background polling for 30s")
                rateLimitBackoffUntil = System.currentTimeMillis() + 30000L
            } else if (res.isSuccessful) {
                val body = res.body?.string() ?: ""
                val json = JSONObject(body)
                if (json.optBoolean("hasIncomingCall", false) && !isInCall && !isCallRinging) {
                    val callObj = json.optJSONObject("incomingCall")
                    if (callObj != null && !isCallRinging && !isInCall) {
                        val callId = callObj.optString("callId", "")
                        val grievanceId = callObj.optString("grievanceId", "")
                        if (isCallDismissed(callId, grievanceId)) {
                            Log.i(TAG, "Ignoring incoming call in background poll — call $callId / case $grievanceId was already left/dismissed")
                        } else {
                            handler.post {
                                handleIncomingCall(callObj.toString())
                            }
                        }
                    }
                }
            }
            res.close()
        } catch (e: Exception) {
            // silent background polling
        }
    }

    fun handleIncomingCall(callJsonString: String) {
        if (isInCall || isCallRinging) return

        try {
            val json = JSONObject(callJsonString)
            val callId = json.optString("callId")
            val grievanceId = json.optString("grievanceId", "Hearing")
            val callerName = json.optString("callerName", "District Collector")
            val callerDesig = json.optString("callerDesignation", "Presiding Officer")
            val title = json.optString("title", "Jan Sunwai Video Hearing")

            if (isCallDismissed(callId, grievanceId)) {
                Log.i(TAG, "handleIncomingCall: Aborting ring — call $callId / case $grievanceId was already left/dismissed")
                return
            }

            isCallRinging = true
            lastReceivedCallData = callJsonString
            try {
                val prefs = getSharedPreferences("jansunwai_voip_prefs", Context.MODE_PRIVATE)
                prefs.edit().putString("last_call_json", callJsonString).commit()
            } catch (e: Exception) {
                // ignore
            }

            currentRingingCallId = callId
            Log.i(TAG, "TRIGGERING INCOMING CALL RING: $callerName for case $grievanceId")

            // Emit real-time event to React Native if app is currently in foreground
            JanSunwaiVoIPModule.emitIncomingCall(callJsonString)

            // 1. Wake screen up
            wakeLock?.let {
                if (!it.isHeld) {
                    it.acquire(60000)
                }
            }

            // 2. Play ringtone reliably with MediaPlayer (supports clean stop)
            try {
                mediaPlayer?.let {
                    if (it.isPlaying) it.stop()
                    it.reset()
                    it.release()
                }
                val ringtoneUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
                mediaPlayer = MediaPlayer().apply {
                    setAudioAttributes(
                        AudioAttributes.Builder()
                            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                            .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                            .build()
                    )
                    setDataSource(applicationContext, ringtoneUri)
                    isLooping = true
                    prepare()
                    start()
                }
            } catch (e: Exception) {
                Log.w(TAG, "Failed to play ringtone with MediaPlayer", e)
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

            // 4. Intent for Native Full-Screen Incoming Call Activity (IncomingCallActivity)
            val reqCode = (System.currentTimeMillis() % 100000).toInt()
            val incomingCallIntent = Intent(this, IncomingCallActivity::class.java).apply {
                addFlags(
                    Intent.FLAG_ACTIVITY_NEW_TASK or
                    Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or
                    Intent.FLAG_ACTIVITY_SINGLE_TOP
                )
                putExtra(EXTRA_CALL_ID, callId)
                putExtra(EXTRA_CALL_DATA, callJsonString)
                putExtra(EXTRA_SERVER_URL, serverUrl)
                putExtra(EXTRA_PHONE, userPhone)
            }

            // CRITICAL (Android 14+ / API 34+): Explicitly allow Background Activity Launch (BAL)
            // Without this bundle, Android 14 silently blocks full-screen intent launches from background services
            val activityOptionsBundle = if (Build.VERSION.SDK_INT >= 34) {
                ActivityOptions.makeBasic()
                    .setPendingIntentBackgroundActivityStartMode(ActivityOptions.MODE_BACKGROUND_ACTIVITY_START_ALLOWED)
                    .toBundle()
            } else null

            val fullScreenPendingIntent = if (Build.VERSION.SDK_INT >= 34 && activityOptionsBundle != null) {
                PendingIntent.getActivity(
                    this, reqCode, incomingCallIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
                    activityOptionsBundle
                )
            } else {
                PendingIntent.getActivity(
                    this, reqCode, incomingCallIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )
            }

            // Accept: directly launch MainActivity via PendingIntent so Android grants BAL (Background Activity Launch)
            // even when app process is completely killed. Saves call data to SharedPrefs first.
            val acceptCallData = try {
                val j = JSONObject(callJsonString)
                j.put("autoAccept", true)
                j.put("callId", callId)
                if (serverUrl.isNotEmpty()) j.put("serverUrl", serverUrl)
                if (userPhone.isNotEmpty()) j.put("userPhone", userPhone)
                j.toString()
            } catch (e: Exception) { callJsonString }

            val acceptMainIntent = Intent(this, MainActivity::class.java).apply {
                addFlags(
                    Intent.FLAG_ACTIVITY_NEW_TASK or
                    Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or
                    Intent.FLAG_ACTIVITY_SINGLE_TOP
                )
                putExtra("action", "accept_call")
                putExtra(EXTRA_CALL_DATA, acceptCallData)
            }
            // Also pre-save to SharedPrefs so MainActivity reads the call on cold start
            try {
                val prefs = getSharedPreferences("jansunwai_voip_prefs", Context.MODE_PRIVATE)
                prefs.edit().putString("pending_accepted_call", acceptCallData).commit()
            } catch (e: Exception) {}

            val acceptPendingIntent = if (Build.VERSION.SDK_INT >= 34 && activityOptionsBundle != null) {
                PendingIntent.getActivity(
                    this, reqCode + 1, acceptMainIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
                    activityOptionsBundle
                )
            } else {
                PendingIntent.getActivity(
                    this, reqCode + 1, acceptMainIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )
            }

            // Decline intent from notification action button
            val declineIntent = Intent(this, JanSunwaiVoIPService::class.java).apply {
                action = ACTION_DECLINE
                putExtra(EXTRA_CALL_ID, callId)
            }
            val declinePendingIntent = PendingIntent.getService(
                this, reqCode + 2, declineIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            val ringtoneUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
                ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)

            val callerPerson = Person.Builder()
                .setName(callerName)
                .setImportant(true)
                .build()

            val notification = NotificationCompat.Builder(this, CALL_CHANNEL_ID)
                .setContentTitle("🏛️ $callerName ($callerDesig)")
                .setContentText("📞 Incoming Video Hearing: #$grievanceId\n$title")
                .setSmallIcon(R.mipmap.ic_launcher)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setSound(ringtoneUri)
                .setFullScreenIntent(fullScreenPendingIntent, true)
                .setContentIntent(fullScreenPendingIntent)
                .setOngoing(true)
                .setAutoCancel(false)
                .addAction(R.mipmap.ic_launcher, "📞 ACCEPT", acceptPendingIntent)
                .addAction(R.mipmap.ic_launcher, "❌ DECLINE", declinePendingIntent)
                .setStyle(
                    NotificationCompat.CallStyle.forIncomingCall(
                        callerPerson,
                        declinePendingIntent,
                        acceptPendingIntent
                    )
                )
                .build()

            // CRITICAL: Promote foreground service to phoneCall type so Android OS grants Background Activity Launch (BAL) exception
            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    startForeground(NOTIFICATION_ID_CALL, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL)
                } else {
                    startForeground(NOTIFICATION_ID_CALL, notification)
                }
            } catch (e: Exception) {
                Log.w(TAG, "Failed to startForeground as phoneCall: ${e.message}")
            }

            // Always also call notify so Heads-Up popup banner appears immediately on screen
            try {
                notificationManager.notify(NOTIFICATION_ID_CALL, notification)
            } catch (e: Exception) {
                Log.w(TAG, "Failed to post notify for call: ${e.message}")
            }

            // 1. Show true full-screen overlay directly on screen via WindowManager if permitted
            try {
                CallOverlayManager.show(applicationContext, callId, callJsonString, serverUrl, userPhone)
            } catch (e: Exception) {
                Log.w(TAG, "CallOverlayManager.show error: ${e.message}")
            }

            // 2. Launch native full-screen incoming call UI immediately on main thread as primary layer
            handler.post {
                try {
                    if (Build.VERSION.SDK_INT >= 34 && activityOptionsBundle != null) {
                        fullScreenPendingIntent.send(this, 0, null, null, null, null, activityOptionsBundle)
                    } else {
                        fullScreenPendingIntent.send()
                    }
                } catch (e: Exception) {
                    try {
                        if (Build.VERSION.SDK_INT >= 34 && activityOptionsBundle != null) {
                            startActivity(incomingCallIntent, activityOptionsBundle)
                        } else {
                            startActivity(incomingCallIntent)
                        }
                    } catch (e2: Exception) {
                        Log.i(TAG, "Direct launch will show via fullScreenIntent / overlay: ${e2.message}")
                    }
                }
            }

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
        isCallRinging = false
        currentRingingCallId = null

        // 1. Synchronously stop and release MediaPlayer immediately
        try {
            mediaPlayer?.let { mp ->
                try { mp.stop() } catch (e: Throwable) {}
                try { mp.reset() } catch (e: Throwable) {}
                try { mp.release() } catch (e: Throwable) {}
            }
            mediaPlayer = null
        } catch (e: Throwable) {
            Log.w(TAG, "Failed to stop mediaPlayer synchronously", e)
        }

        // 2. Synchronously cancel vibrator immediately
        try {
            vibrator?.cancel()
        } catch (e: Throwable) {
            // ignore
        }

        // 3. Release wake lock
        try {
            wakeLock?.let {
                if (it.isHeld) it.release()
            }
        } catch (e: Throwable) {
            // ignore
        }

        handler.post {
            // Double check MediaPlayer release on main thread
            try {
                mediaPlayer?.let { mp ->
                    try { mp.stop() } catch (e: Throwable) {}
                    try { mp.reset() } catch (e: Throwable) {}
                    try { mp.release() } catch (e: Throwable) {}
                }
                mediaPlayer = null
            } catch (e: Throwable) {
                // ignore
            }

            try {
                vibrator?.cancel()
            } catch (e: Throwable) {
                // ignore
            }

            // Cancel the call alert notification without dropping foreground status
            try {
                val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                notificationManager.cancel(NOTIFICATION_ID_CALL)
            } catch (e: Throwable) {
                // ignore
            }

            // Immediately switch to the non-alerting ongoing foreground notification
            if (isServiceRunning) {
                try {
                    val ongoingNotif = if (isInCall) createInCallNotification() else createStandbyNotification()
                    startForeground(NOTIFICATION_ID_STANDBY, ongoingNotif)
                } catch (e: Throwable) {
                    Log.w(TAG, "startForeground ongoingNotif error: ${e.message}")
                }
            }

            // Dismiss CallOverlay if active
            try {
                CallOverlayManager.dismiss(applicationContext)
            } catch (e: Throwable) {
                // ignore
            }

            // Also dismiss native IncomingCallActivity if open
            try {
                IncomingCallActivity.activeInstance?.finish()
            } catch (e: Throwable) {
                // ignore
            }

            Log.i(TAG, "Stopped ringing, silenced audio and restored standby/in-call notification (isInCall: $isInCall)")
        }
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
                    .addHeader("Bypass-Tunnel-Reminder", "true")
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

        try {
            standbyWakeLock?.let {
                if (it.isHeld) it.release()
            }
        } catch (e: Exception) {
            // ignore
        }

        isServiceRunning = false
        isPollingActive = false
        try {
            pollingThread?.interrupt()
        } catch (e: Exception) {
            // ignore
        }
        pollingThread = null

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
        instance = null
        Log.i(TAG, "JanSunwaiVoIPService onDestroy - checking revival")
        try {
            standbyWakeLock?.let {
                if (it.isHeld) it.release()
            }
        } catch (e: Exception) {
            // ignore
        }

        // If the service was destroyed by OS (not an explicit user logout), revive it immediately!
        if (isServiceRunning) {
            try {
                val restartIntent = Intent(applicationContext, VoIPRestartReceiver::class.java).apply {
                    action = VoIPRestartReceiver.ACTION_RESTART
                }
                sendBroadcast(restartIntent)

                val pendingIntent = PendingIntent.getBroadcast(
                    applicationContext,
                    9092,
                    restartIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )
                val alarmManager = getSystemService(Context.ALARM_SERVICE) as? android.app.AlarmManager
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    alarmManager?.setExactAndAllowWhileIdle(
                        android.app.AlarmManager.RTC_WAKEUP,
                        System.currentTimeMillis() + 1500,
                        pendingIntent
                    )
                } else {
                    alarmManager?.setExact(
                        android.app.AlarmManager.RTC_WAKEUP,
                        System.currentTimeMillis() + 1500,
                        pendingIntent
                    )
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to send revival in onDestroy", e)
            }
        }
    }
}
