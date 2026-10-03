package com.psg.mail

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Intent
import android.os.Build
import android.os.Bundle
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.messaging.FirebaseMessaging
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import org.json.JSONObject

/**
 * New-mail push. The worker sends FCM notifications on the "psg-mail-inbox"
 * channel (see mail-worker/src/service/firebase-push-service.js); while the
 * app is in the background Android shows them itself, and tapping one starts
 * this activity with the message data (emailId, accountId) as extras.
 *
 * Firebase is configured from assets/google-services.json (CI restores it
 * from the FIREBASE_ANDROID_GOOGLE_SERVICES_JSON_B64 secret). Without that
 * file push is simply off and the app falls back to polling.
 */
class MainActivity : FlutterActivity() {
    private var pendingEmailId: String? = null
    private var channel: MethodChannel? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        createInboxChannel()
        pendingEmailId = intent?.extras?.getString("emailId")
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        val emailId = intent.extras?.getString("emailId") ?: return
        // App already running: tell Dart directly.
        channel?.invokeMethod("openEmail", emailId) ?: run { pendingEmailId = emailId }
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        channel = MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "psg/push").also {
            it.setMethodCallHandler { call, result ->
                when (call.method) {
                    "getToken" -> {
                        if (!ensureFirebase()) {
                            result.success(null)
                        } else {
                            FirebaseMessaging.getInstance().token
                                .addOnSuccessListener { token -> result.success(token) }
                                .addOnFailureListener { result.success(null) }
                        }
                    }
                    "takeLaunchEmailId" -> {
                        result.success(pendingEmailId)
                        pendingEmailId = null
                    }
                    else -> result.notImplemented()
                }
            }
        }
    }

    private fun createInboxChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = getSystemService(NotificationManager::class.java) ?: return
        if (manager.getNotificationChannel(INBOX_CHANNEL) != null) return
        manager.createNotificationChannel(
            NotificationChannel(INBOX_CHANNEL, "New mail", NotificationManager.IMPORTANCE_HIGH)
        )
    }

    private fun ensureFirebase(): Boolean {
        if (FirebaseApp.getApps(this).isNotEmpty()) return true
        return try {
            val json = JSONObject(assets.open("google-services.json").bufferedReader().use { it.readText() })
            val project = json.getJSONObject("project_info")
            val clients = json.getJSONArray("client")
            var client: JSONObject? = null
            for (i in 0 until clients.length()) {
                val c = clients.getJSONObject(i)
                val pkg = c.getJSONObject("client_info").getJSONObject("android_client_info").optString("package_name")
                if (pkg == packageName) client = c
            }
            if (client == null) return false
            val options = FirebaseOptions.Builder()
                .setApplicationId(client.getJSONObject("client_info").getString("mobilesdk_app_id"))
                .setApiKey(client.getJSONArray("api_key").getJSONObject(0).getString("current_key"))
                .setProjectId(project.getString("project_id"))
                .setGcmSenderId(project.getString("project_number"))
                .build()
            FirebaseApp.initializeApp(this, options)
            true
        } catch (e: Exception) {
            false
        }
    }

    companion object {
        const val INBOX_CHANNEL = "psg-mail-inbox"
    }
}
