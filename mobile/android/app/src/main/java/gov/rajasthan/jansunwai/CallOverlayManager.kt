package gov.rajasthan.jansunwai

import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.util.Log
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject

/**
 * CallOverlayManager
 *
 * Displays a true full-screen overlay directly via Android's WindowManager.
 * This bypasses Android 10/11/12/13/14 Background Activity Launch (BAL) restrictions,
 * guaranteeing that the full-screen call pop-up appears on screen immediately
 * over any other app, game, video, or home screen when a hearing call arrives.
 */
object CallOverlayManager {

    private const val TAG = "CallOverlayManager"
    private var overlayView: View? = null
    private var isPulseActive = false
    private val handler = Handler(Looper.getMainLooper())

    fun isShowing(): Boolean = overlayView != null

    fun show(
        context: Context,
        callId: String,
        callJsonString: String,
        serverUrl: String,
        userPhone: String
    ) {
        handler.post {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(context)) {
                    Log.w(TAG, "Cannot show overlay: SYSTEM_ALERT_WINDOW permission not granted")
                    return@post
                }

                // If an overlay is already active, dismiss it first
                dismiss(context)

                val windowManager = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager

                val json = try {
                    JSONObject(callJsonString)
                } catch (e: Exception) {
                    JSONObject()
                }

                val grievanceId = json.optString("grievanceId", "Hearing")
                val effectiveCallId = if (callId.isNotEmpty() && callId != "undefined" && callId != "null") {
                    callId
                } else {
                    val fromJson = json.optString("callId", "")
                    if (fromJson.isNotEmpty() && fromJson != "undefined" && fromJson != "null") fromJson else grievanceId
                }

                val callerName = json.optString("callerName", "District Collector")
                val callerDesig = json.optString("callerDesignation", "Presiding Officer")
                val title = json.optString("title", "Jan Sunwai Video Hearing")

                val density = context.resources.displayMetrics.density
                fun dp(value: Int): Int = (value * density).toInt()

                // Root layout covering the entire screen
                val rootLayout = LinearLayout(context).apply {
                    orientation = LinearLayout.VERTICAL
                    setBackgroundColor(Color.parseColor("#090E1A"))
                    setPadding(dp(24), dp(48), dp(24), dp(40))
                    layoutParams = ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT
                    )
                    gravity = Gravity.CENTER_HORIZONTAL
                }

                // Top Government Header
                val headerLayout = LinearLayout(context).apply {
                    orientation = LinearLayout.VERTICAL
                    gravity = Gravity.CENTER_HORIZONTAL
                    layoutParams = LinearLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.WRAP_CONTENT
                    ).apply {
                        bottomMargin = dp(24)
                    }
                }

                val emblemText = TextView(context).apply {
                    text = "🏛️"
                    textSize = 34f
                    gravity = Gravity.CENTER
                    setPadding(0, 0, 0, dp(4))
                }
                headerLayout.addView(emblemText)

                val govTitle = TextView(context).apply {
                    text = "GOVERNMENT OF RAJASTHAN"
                    textSize = 13f
                    typeface = Typeface.DEFAULT_BOLD
                    setTextColor(Color.parseColor("#F59E0B"))
                    letterSpacing = 0.15f
                    gravity = Gravity.CENTER
                }
                headerLayout.addView(govTitle)

                val govSub = TextView(context).apply {
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
                val hearingPill = TextView(context).apply {
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
                val caseBadge = TextView(context).apply {
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
                        bottomMargin = dp(28)
                    }
                }
                rootLayout.addView(caseBadge)

                // Center Glowing Circular Avatar
                val avatarSize = dp(96)
                val avatarBg = GradientDrawable().apply {
                    shape = GradientDrawable.OVAL
                    setColor(Color.parseColor("#1E3A8A"))
                    setStroke(dp(3), Color.parseColor("#F59E0B"))
                }
                val avatarView = TextView(context).apply {
                    text = "🏛️"
                    textSize = 42f
                    gravity = Gravity.CENTER
                    background = avatarBg
                    layoutParams = LinearLayout.LayoutParams(avatarSize, avatarSize).apply {
                        bottomMargin = dp(18)
                    }
                }
                rootLayout.addView(avatarView)

                // Caller Name
                val callerNameView = TextView(context).apply {
                    text = callerName
                    textSize = 25f
                    typeface = Typeface.DEFAULT_BOLD
                    setTextColor(Color.WHITE)
                    gravity = Gravity.CENTER
                    setPadding(0, 0, 0, dp(4))
                }
                rootLayout.addView(callerNameView)

                // Caller Designation
                val callerDesigView = TextView(context).apply {
                    text = callerDesig
                    textSize = 15f
                    typeface = Typeface.DEFAULT_BOLD
                    setTextColor(Color.parseColor("#38BDF8"))
                    gravity = Gravity.CENTER
                    setPadding(0, 0, 0, dp(8))
                }
                rootLayout.addView(callerDesigView)

                // Hearing Title
                val titleView = TextView(context).apply {
                    text = title
                    textSize = 13f
                    setTextColor(Color.parseColor("#94A3B8"))
                    gravity = Gravity.CENTER
                    maxLines = 2
                    setPadding(dp(12), 0, dp(12), dp(12))
                }
                rootLayout.addView(titleView)

                // Pulsing Ring Status
                val statusView = TextView(context).apply {
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

                isPulseActive = true
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

                // Action Buttons (Decline & Accept)
                val buttonLayout = LinearLayout(context).apply {
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
                val declineBtn = Button(context).apply {
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
                        Log.i(TAG, "User tapped DECLINE on CallOverlay")
                        dismiss(context)
                        IncomingCallActivity.activeInstance?.finish()
                        JanSunwaiVoIPService.dismissCall(callId)
                        JanSunwaiVoIPService.stopActiveRinging()

                        if (effectiveCallId.isNotEmpty() && serverUrl.isNotEmpty() && userPhone.isNotEmpty()) {
                            Thread {
                                try {
                                    val cleanBase = serverUrl.trim().trimEnd('/')
                                    val url = "${cleanBase}/api/calls/${effectiveCallId}/respond"
                                    val body = JSONObject().apply {
                                        put("phone", userPhone)
                                        put("action", "decline")
                                        put("callId", effectiveCallId)
                                    }.toString()

                                    val client = OkHttpClient()
                                    val req = Request.Builder()
                                        .url(url)
                                        .addHeader("Bypass-Tunnel-Reminder", "true")
                                        .post(body.toRequestBody("application/json".toMediaTypeOrNull()))
                                        .build()
                                    client.newCall(req).execute().close()
                                } catch (e: Exception) {
                                    Log.w(TAG, "Error posting decline", e)
                                }
                            }.start()
                        }
                    }
                }
                buttonLayout.addView(declineBtn)

                // Accept Button
                val acceptBg = GradientDrawable().apply {
                    shape = GradientDrawable.RECTANGLE
                    cornerRadius = dp(28).toFloat()
                    setColor(Color.parseColor("#16A34A"))
                }
                val acceptBtn = Button(context).apply {
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
                        Log.i(TAG, "User tapped ACCEPT on CallOverlay")
                        dismiss(context)
                        IncomingCallActivity.activeInstance?.finish()

                        JanSunwaiVoIPService.dismissCall(effectiveCallId)
                        JanSunwaiVoIPService.stopActiveRinging()
                        JanSunwaiVoIPService.setInCallState(true)

                        // Launch MainActivity with accepted call data
                        val updatedCallData = try {
                            val j = if (callJsonString.isNotEmpty()) JSONObject(callJsonString) else JSONObject()
                            j.put("autoAccept", true)
                            j.put("callId", effectiveCallId)
                            if (serverUrl.isNotEmpty()) j.put("serverUrl", serverUrl)
                            if (userPhone.isNotEmpty()) j.put("userPhone", userPhone)
                            j.toString()
                        } catch (e: Exception) {
                            callJsonString
                        }

                        // Save synchronously to SharedPreferences so MainActivity reads it across processes
                        try {
                            val prefs = context.getSharedPreferences("jansunwai_voip_prefs", Context.MODE_PRIVATE)
                            prefs.edit().putString("pending_accepted_call", updatedCallData).commit()
                        } catch (e: Exception) {
                            Log.w(TAG, "Error saving pending_accepted_call to prefs", e)
                        }

                        JanSunwaiVoIPModule.pendingIncomingCallJson = updatedCallData

                        val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)?.apply {
                            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
                            putExtra("action", "accept_call")
                            putExtra(JanSunwaiVoIPService.EXTRA_CALL_DATA, updatedCallData)
                        } ?: Intent(context, MainActivity::class.java).apply {
                            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
                            putExtra("action", "accept_call")
                            putExtra(JanSunwaiVoIPService.EXTRA_CALL_DATA, updatedCallData)
                        }
                        context.startActivity(launchIntent)
                    }
                }
                buttonLayout.addView(acceptBtn)

                rootLayout.addView(buttonLayout)

                // WindowManager Layout Parameters
                val layoutType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                } else {
                    @Suppress("DEPRECATION")
                    WindowManager.LayoutParams.TYPE_PHONE
                }

                val flags = WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                        WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
                        WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or
                        WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD or
                        WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
                        WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS

                val params = WindowManager.LayoutParams(
                    WindowManager.LayoutParams.MATCH_PARENT,
                    WindowManager.LayoutParams.MATCH_PARENT,
                    layoutType,
                    flags,
                    PixelFormat.TRANSLUCENT
                ).apply {
                    gravity = Gravity.CENTER
                }

                windowManager.addView(rootLayout, params)
                overlayView = rootLayout
                Log.i(TAG, "Full-screen CallOverlay successfully added to WindowManager!")

            } catch (e: Exception) {
                Log.e(TAG, "Failed to display CallOverlay", e)
            }
        }
    }

    fun dismiss(context: Context) {
        handler.post {
            isPulseActive = false
            handler.removeCallbacksAndMessages(null)
            overlayView?.let { view ->
                try {
                    val windowManager = (context.applicationContext ?: context).getSystemService(Context.WINDOW_SERVICE) as WindowManager
                    windowManager.removeViewImmediate(view)
                    Log.i(TAG, "CallOverlay successfully removed from WindowManager")
                } catch (e: Exception) {
                    try {
                        val windowManager = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
                        windowManager.removeView(view)
                    } catch (e2: Exception) {
                        Log.w(TAG, "Error removing CallOverlay view", e2)
                    }
                }
                overlayView = null
            }
            try {
                IncomingCallActivity.activeInstance?.finishAndRemoveTask()
            } catch (e: Exception) {
                IncomingCallActivity.activeInstance?.finish()
            }
        }
    }
}
