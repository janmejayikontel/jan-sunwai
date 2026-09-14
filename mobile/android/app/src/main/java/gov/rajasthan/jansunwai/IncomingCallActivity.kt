package gov.rajasthan.jansunwai

import android.app.KeyguardManager
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject

/**
 * Native Full-Screen Incoming Call Activity
 *
 * Displays a full-screen pop-up when an official hearing call arrives,
 * even when the device is locked or the screen is off (WhatsApp / true VoIP style).
 * Handles multiple calls cleanly with singleInstance launchMode and onNewIntent.
 */
class IncomingCallActivity : AppCompatActivity() {

    companion object {
        const val TAG = "IncomingCallActivity"
        var activeInstance: IncomingCallActivity? = null
    }

    private var callId: String = ""
    private var callDataStr: String = ""
    private var serverUrl: String = ""
    private var userPhone: String = ""
    private val handler = Handler(Looper.getMainLooper())
    private var isPulseActive = true

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        activeInstance = this
        applyWindowFlags()
        renderCallUI(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        activeInstance = this
        applyWindowFlags()
        renderCallUI(intent)
    }

    override fun onResume() {
        super.onResume()
        applyWindowFlags()
    }

    private fun applyWindowFlags() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
            val keyguardManager = getSystemService(Context.KEYGUARD_SERVICE) as? KeyguardManager
            keyguardManager?.requestDismissKeyguard(this, null)
        }
        @Suppress("DEPRECATION")
        window.addFlags(
            WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
            WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD or
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or
            WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
        )
    }

    private fun renderCallUI(incomingIntent: Intent) {
        // Stop any prior pulse handler
        isPulseActive = false
        handler.removeCallbacksAndMessages(null)
        isPulseActive = true

        // 1. Parse Intent Extras
        callDataStr = incomingIntent.getStringExtra(JanSunwaiVoIPService.EXTRA_CALL_DATA) ?: ""
        callId = incomingIntent.getStringExtra(JanSunwaiVoIPService.EXTRA_CALL_ID) ?: ""
        serverUrl = incomingIntent.getStringExtra(JanSunwaiVoIPService.EXTRA_SERVER_URL) ?: ""
        userPhone = incomingIntent.getStringExtra(JanSunwaiVoIPService.EXTRA_PHONE) ?: ""

        val json = try {
            JSONObject(callDataStr)
        } catch (e: Exception) {
            JSONObject()
        }

        if (callId.isEmpty()) {
            callId = json.optString("callId", "")
        }

        val grievanceId = json.optString("grievanceId", "Hearing")
        val callerName = json.optString("callerName", "District Collector")
        val callerDesig = json.optString("callerDesignation", "Presiding Officer")
        val title = json.optString("title", "Jan Sunwai Video Hearing")

        Log.i(TAG, "Rendering full-screen incoming call UI: $callerName for Case #$grievanceId (callId: $callId)")

        // 2. Build Rich Native UI
        val density = resources.displayMetrics.density
        fun dp(value: Int): Int = (value * density).toInt()

        val rootLayout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.parseColor("#090E1A"))
            setPadding(dp(24), dp(48), dp(24), dp(40))
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
            gravity = Gravity.CENTER_HORIZONTAL
        }

        // Top Government Emblem & Header
        val headerLayout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            ).apply {
                bottomMargin = dp(24)
            }
        }

        val emblemText = TextView(this).apply {
            text = "🏛️"
            textSize = 34f
            gravity = Gravity.CENTER
            setPadding(0, 0, 0, dp(4))
        }
        headerLayout.addView(emblemText)

        val govTitle = TextView(this).apply {
            text = "GOVERNMENT OF RAJASTHAN"
            textSize = 13f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.parseColor("#F59E0B"))
            letterSpacing = 0.15f
            gravity = Gravity.CENTER
        }
        headerLayout.addView(govTitle)

        val govSub = TextView(this).apply {
            text = "Department of Administrative Reforms & Public Grievances"
            textSize = 10f
            setTextColor(Color.parseColor("#94A3B8"))
            gravity = Gravity.CENTER
            setPadding(0, dp(2), 0, dp(8))
        }
        headerLayout.addView(govSub)

        // Hearing Pill Badge
        val pillBg = GradientDrawable().apply {
            shape = GradientDrawable.RECTANGLE
            cornerRadius = dp(20).toFloat()
            setColor(Color.parseColor("#1E293B"))
            setStroke(dp(1), Color.parseColor("#3B82F6"))
        }
        val hearingPill = TextView(this).apply {
            text = "OFFICIAL JAN SUNWAI VIDEO HEARING"
            textSize = 11f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.parseColor("#60A5FA"))
            background = pillBg
            setPadding(dp(14), dp(6), dp(14), dp(6))
            gravity = Gravity.CENTER
        }
        headerLayout.addView(hearingPill)

        rootLayout.addView(headerLayout)

        // Case ID Badge
        val caseBadgeBg = GradientDrawable().apply {
            shape = GradientDrawable.RECTANGLE
            cornerRadius = dp(10).toFloat()
            setColor(Color.parseColor("#131D33"))
            setStroke(dp(1), Color.parseColor("#1E3A8A"))
        }
        val caseBadge = TextView(this).apply {
            text = "Grievance Case #$grievanceId"
            textSize = 13f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.parseColor("#93C5FD"))
            background = caseBadgeBg
            setPadding(dp(16), dp(8), dp(16), dp(8))
            gravity = Gravity.CENTER
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            ).apply {
                bottomMargin = dp(32)
            }
        }
        rootLayout.addView(caseBadge)

        // Center Profile: Glowing Circular Avatar
        val avatarSize = dp(100)
        val avatarBg = GradientDrawable().apply {
            shape = GradientDrawable.OVAL
            setColor(Color.parseColor("#1E3A8A"))
            setStroke(dp(3), Color.parseColor("#F59E0B"))
        }
        val avatarView = TextView(this).apply {
            text = "🏛️"
            textSize = 44f
            gravity = Gravity.CENTER
            background = avatarBg
            layoutParams = LinearLayout.LayoutParams(avatarSize, avatarSize).apply {
                bottomMargin = dp(20)
            }
        }
        rootLayout.addView(avatarView)

        // Caller Name
        val callerNameView = TextView(this).apply {
            text = callerName
            textSize = 25f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
            setPadding(0, 0, 0, dp(4))
        }
        rootLayout.addView(callerNameView)

        // Caller Designation
        val callerDesigView = TextView(this).apply {
            text = callerDesig
            textSize = 15f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.parseColor("#38BDF8"))
            gravity = Gravity.CENTER
            setPadding(0, 0, 0, dp(8))
        }
        rootLayout.addView(callerDesigView)

        // Hearing Title
        val titleView = TextView(this).apply {
            text = title
            textSize = 13f
            setTextColor(Color.parseColor("#94A3B8"))
            gravity = Gravity.CENTER
            maxLines = 2
            setPadding(dp(12), 0, dp(12), dp(16))
        }
        rootLayout.addView(titleView)

        // Pulsing Ring Status
        val statusView = TextView(this).apply {
            text = "● Incoming Official Call... Ringing"
            textSize = 14f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.parseColor("#10B981"))
            gravity = Gravity.CENTER
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                0,
                1.0f
            ).apply {
                gravity = Gravity.CENTER
            }
        }
        rootLayout.addView(statusView)

        // Start subtle status pulse animation
        val pulseRunnable = object : Runnable {
            var toggle = false
            override fun run() {
                if (!isPulseActive) return
                statusView.alpha = if (toggle) 0.4f else 1.0f
                toggle = !toggle
                handler.postDelayed(this, 600)
            }
        }
        handler.post(pulseRunnable)

        // Bottom Action Controls (Decline & Accept)
        val buttonLayout = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            ).apply {
                topMargin = dp(16)
            }
            weightSum = 2.0f
        }

        // Decline Button
        val declineBg = GradientDrawable().apply {
            shape = GradientDrawable.RECTANGLE
            cornerRadius = dp(28).toFloat()
            setColor(Color.parseColor("#DC2626"))
        }
        val declineBtn = Button(this).apply {
            text = "✕ DECLINE"
            textSize = 15f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.WHITE)
            background = declineBg
            layoutParams = LinearLayout.LayoutParams(
                0,
                dp(56),
                1.0f
            ).apply {
                marginEnd = dp(12)
            }
            setOnClickListener {
                onDeclineClicked()
            }
        }
        buttonLayout.addView(declineBtn)

        // Accept Button
        val acceptBg = GradientDrawable().apply {
            shape = GradientDrawable.RECTANGLE
            cornerRadius = dp(28).toFloat()
            setColor(Color.parseColor("#16A34A"))
        }
        val acceptBtn = Button(this).apply {
            text = "📞 ACCEPT"
            textSize = 15f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.WHITE)
            background = acceptBg
            layoutParams = LinearLayout.LayoutParams(
                0,
                dp(56),
                1.0f
            ).apply {
                marginStart = dp(12)
            }
            setOnClickListener {
                onAcceptClicked()
            }
        }
        buttonLayout.addView(acceptBtn)

        rootLayout.addView(buttonLayout)
        setContentView(rootLayout)
    }

    private fun onDeclineClicked() {
        Log.i(TAG, "User tapped DECLINE on incoming call screen")
        isPulseActive = false

        // Stop ringing sound and vibration immediately and blacklist call from re-ringing
        JanSunwaiVoIPService.dismissCall(callId)
        JanSunwaiVoIPService.stopActiveRinging()

        // Send decline signal to backend in background thread
        if (callId.isNotEmpty() && serverUrl.isNotEmpty() && userPhone.isNotEmpty()) {
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
                } catch (e: Exception) {
                    Log.w(TAG, "Error posting decline to server", e)
                }
            }.start()
        }

        CallOverlayManager.dismiss(applicationContext)
        finish()
    }

    private fun onAcceptClicked() {
        Log.i(TAG, "User tapped ACCEPT on incoming call screen")
        isPulseActive = false

        // 1. Immediately dismiss CallOverlay and stop ringing/vibration
        CallOverlayManager.dismiss(applicationContext)
        JanSunwaiVoIPService.dismissCall(callId)
        JanSunwaiVoIPService.stopActiveRinging()
        JanSunwaiVoIPService.setInCallState(true)

        // 2. Immediately launch MainActivity so user sees the meeting room right away
        launchMainActivity("", "", "")

        // 3. Post accept response to server in background thread as non-blocking confirmation
        if (callId.isNotEmpty() && serverUrl.isNotEmpty() && userPhone.isNotEmpty()) {
            Thread {
                try {
                    val cleanBase = serverUrl.trim().trimEnd('/')
                    val url = "${cleanBase}/api/calls/${callId}/respond"
                    val body = JSONObject().apply {
                        put("phone", userPhone)
                        put("action", "accept")
                    }.toString()

                    val client = OkHttpClient()
                    val req = Request.Builder()
                        .url(url)
                        .post(body.toRequestBody("application/json".toMediaTypeOrNull()))
                        .build()
                    client.newCall(req).execute().close()
                } catch (e: Exception) {
                    Log.w(TAG, "Background accept notify error", e)
                }
            }.start()
        }
    }

    private fun launchMainActivity(token: String, roomName: String, lkUrl: String) {
        val updatedCallData = try {
            val j = if (callDataStr.isNotEmpty()) JSONObject(callDataStr) else JSONObject()
            j.put("autoAccept", true)
            j.put("callId", callId)
            if (serverUrl.isNotEmpty()) j.put("serverUrl", serverUrl)
            if (userPhone.isNotEmpty()) j.put("userPhone", userPhone)
            if (token.isNotEmpty()) j.put("livekitToken", token)
            if (roomName.isNotEmpty()) j.put("livekitRoomName", roomName)
            if (lkUrl.isNotEmpty()) j.put("livekitUrl", lkUrl)
            j.toString()
        } catch (e: Exception) {
            callDataStr
        }

        // Save synchronously to SharedPreferences so MainActivity in the main process reads it immediately
        try {
            val prefs = getSharedPreferences("jansunwai_voip_prefs", Context.MODE_PRIVATE)
            prefs.edit().putString("pending_accepted_call", updatedCallData).commit()
        } catch (e: Exception) {
            Log.w(TAG, "Error saving pending_accepted_call to prefs", e)
        }

        JanSunwaiVoIPModule.pendingIncomingCallJson = updatedCallData

        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)?.apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
            putExtra("action", "accept_call")
            putExtra(JanSunwaiVoIPService.EXTRA_CALL_DATA, updatedCallData)
        } ?: Intent(this, MainActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            putExtra("action", "accept_call")
            putExtra(JanSunwaiVoIPService.EXTRA_CALL_DATA, updatedCallData)
        }

        CallOverlayManager.dismiss(applicationContext)
        startActivity(launchIntent)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            finishAndRemoveTask()
        } else {
            finish()
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        isPulseActive = false
        handler.removeCallbacksAndMessages(null)
        if (activeInstance == this) {
            activeInstance = null
        }
    }
}
