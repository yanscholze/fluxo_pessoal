package com.fluxo.pessoal.notifications

import android.content.Context
import android.content.Intent
import android.provider.Settings
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Ponte JS <-> nativo para o listener de notificações. Ver
 * mobile/src/notification-bridge.ts para o lado JS.
 */
class NotificationBridgeModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

  override fun getName() = "FluxoNotificationBridge"

  @ReactMethod
  fun isEnabled(promise: Promise) {
    try {
      val context = reactApplicationContext
      val enabledListeners = Settings.Secure.getString(context.contentResolver, "enabled_notification_listeners") ?: ""
      promise.resolve(enabledListeners.contains(context.packageName))
    } catch (error: Exception) {
      promise.reject("FLUXO_NOTIFICATION_BRIDGE_ERROR", error)
    }
  }

  @ReactMethod
  fun openSettings() {
    val intent = Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS").apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    reactApplicationContext.startActivity(intent)
  }

  @ReactMethod
  fun setCredentials(baseUrl: String, deviceToken: String, promise: Promise) {
    try {
      reactApplicationContext.getSharedPreferences("fluxo_notification_bridge", Context.MODE_PRIVATE)
        .edit()
        .putString("base_url", baseUrl)
        .putString("device_token", deviceToken)
        .apply()
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("FLUXO_NOTIFICATION_BRIDGE_ERROR", error)
    }
  }

  @ReactMethod
  fun clearCredentials(promise: Promise) {
    try {
      reactApplicationContext.getSharedPreferences("fluxo_notification_bridge", Context.MODE_PRIVATE)
        .edit().clear().apply()
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("FLUXO_NOTIFICATION_BRIDGE_ERROR", error)
    }
  }
}
