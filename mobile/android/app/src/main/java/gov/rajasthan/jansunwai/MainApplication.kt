package gov.rajasthan.jansunwai

import android.app.Application
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.util.Log

import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactNativeHost
import com.facebook.react.ReactPackage
import com.facebook.react.ReactHost
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.load
import com.facebook.react.defaults.DefaultReactNativeHost
import com.facebook.soloader.SoLoader

import expo.modules.ApplicationLifecycleDispatcher
import expo.modules.ReactNativeHostWrapper

class MainApplication : Application(), ReactApplication {

  override val reactNativeHost: ReactNativeHost = ReactNativeHostWrapper(
        this,
        object : DefaultReactNativeHost(this) {
          override fun getPackages(): List<ReactPackage> {
            // Packages that cannot be autolinked yet can be added manually here, for example:
            // packages.add(new MyReactNativePackage());
            return PackageList(this).packages
          }

          override fun getJSMainModuleName(): String = "index"

          override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG

          override val isNewArchEnabled: Boolean = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
          override val isHermesEnabled: Boolean = BuildConfig.IS_HERMES_ENABLED
      }
  )

  override val reactHost: ReactHost?
    get() = if (BuildConfig.IS_NEW_ARCHITECTURE_ENABLED) {
      ReactNativeHostWrapper.createReactHost(applicationContext, reactNativeHost)
    } else {
      null
    }

  override fun onCreate() {
    super.onCreate()

    // Global uncaught crash handler to show full diagnostics on-screen
    val defaultHandler = Thread.getDefaultUncaughtExceptionHandler()
    Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
      Log.e("JanSunwai", "Uncaught exception caught in MainApplication", throwable)
      try {
        val intent = Intent(this, CrashActivity::class.java).apply {
          putExtra("error_message", throwable.javaClass.simpleName + ": " + (throwable.message ?: "Unknown error"))
          putExtra("stack_trace", Log.getStackTraceString(throwable))
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
        }
        startActivity(intent)
      } catch (e: Exception) {
        Log.e("JanSunwai", "Failed to launch CrashActivity", e)
        defaultHandler?.uncaughtException(thread, throwable)
      }
    }

    SoLoader.init(this, false)
    // Enable WebRTC Android MediaProjectionService for native screen sharing
    try {
      com.oney.WebRTCModule.WebRTCModuleOptions.getInstance().enableMediaProjectionService = true
    } catch (e: Throwable) {
      Log.w("JanSunwai", "Failed to configure WebRTCModuleOptions", e)
    }

    if (BuildConfig.IS_NEW_ARCHITECTURE_ENABLED) {
      // If you opted-in for the New Architecture, we load the native entry point for this app.
      load()
    }
    ApplicationLifecycleDispatcher.onApplicationCreate(this)
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    ApplicationLifecycleDispatcher.onConfigurationChanged(this, newConfig)
  }
}
