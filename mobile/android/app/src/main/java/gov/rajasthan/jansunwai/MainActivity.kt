package gov.rajasthan.jansunwai

import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.view.WindowManager

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

import expo.modules.ReactActivityDelegateWrapper

class MainActivity : ReactActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    setTheme(R.style.AppTheme)
    super.onCreate(null)
    applyWindowFlags()
    CallOverlayManager.dismiss(this)
    IncomingCallActivity.activeInstance?.finish()

    // Read call data from intent (e.g. from notification Accept button)
    val intentCallData = intent?.getStringExtra(JanSunwaiVoIPService.EXTRA_CALL_DATA)
    if (!intentCallData.isNullOrBlank()) {
      JanSunwaiVoIPModule.pendingIncomingCallJson = intentCallData
      try {
        val prefs = getSharedPreferences("jansunwai_voip_prefs", android.content.Context.MODE_PRIVATE)
        prefs.edit().putString("pending_accepted_call", intentCallData).commit()
      } catch (e: Exception) {
        // ignore
      }
      JanSunwaiVoIPModule.emitIncomingCall(intentCallData)
    } else {
      // Fallback: check SharedPrefs for call data saved by background service (cold start from Accept notification)
      try {
        val prefs = getSharedPreferences("jansunwai_voip_prefs", android.content.Context.MODE_PRIVATE)
        val savedCall = prefs.getString("pending_accepted_call", null)
        if (!savedCall.isNullOrBlank()) {
          JanSunwaiVoIPModule.pendingIncomingCallJson = savedCall
          android.util.Log.i("MainActivity", "Cold-start: restored pending_accepted_call from SharedPrefs: $savedCall")
          JanSunwaiVoIPModule.emitIncomingCall(savedCall)
        }
      } catch (e: Exception) {
        // ignore
      }
    }
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    applyWindowFlags()
    CallOverlayManager.dismiss(this)
    IncomingCallActivity.activeInstance?.finish()

    intent.getStringExtra(JanSunwaiVoIPService.EXTRA_CALL_DATA)?.let {
      JanSunwaiVoIPModule.pendingIncomingCallJson = it
      try {
        val prefs = getSharedPreferences("jansunwai_voip_prefs", android.content.Context.MODE_PRIVATE)
        prefs.edit().putString("pending_accepted_call", it).commit()
      } catch (e: Exception) {
        // ignore
      }
      // CRITICAL: Immediately emit to React Native so it directly transitions into VideoHearingScreen
      JanSunwaiVoIPModule.emitIncomingCall(it)
    }
  }

  override fun onResume() {
    super.onResume()
    applyWindowFlags()
    CallOverlayManager.dismiss(this)
    IncomingCallActivity.activeInstance?.finish()
  }

  private fun applyWindowFlags() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
      val keyguardManager = getSystemService(android.content.Context.KEYGUARD_SERVICE) as? android.app.KeyguardManager
      keyguardManager?.requestDismissKeyguard(this, null)
    }
    @Suppress("DEPRECATION")
    window.addFlags(
      WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
      WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
      WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or
      WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
    )
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "main"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate {
    return ReactActivityDelegateWrapper(
          this,
          BuildConfig.IS_NEW_ARCHITECTURE_ENABLED,
          object : DefaultReactActivityDelegate(
              this,
              mainComponentName,
              fabricEnabled
          ){})
  }

  /**
    * Align the back button behavior with Android S
    * where moving root activities to background instead of finishing activities.
    * @see <a href="https://developer.android.com/reference/android/app/Activity#onBackPressed()">onBackPressed</a>
    */
  override fun invokeDefaultOnBackPressed() {
      if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.R) {
          if (!moveTaskToBack(false)) {
              // For non-root activities, use the default implementation to finish them.
              super.invokeDefaultOnBackPressed()
          }
          return
      }

      // Use the default back button implementation on Android S
      // because it's doing more than [Activity.moveTaskToBack] in fact.
      super.invokeDefaultOnBackPressed()
  }
}
