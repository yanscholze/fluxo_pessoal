package com.fluxo.pessoal.notifications

import android.app.Notification
import android.content.Context
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import org.json.JSONObject

/**
 * Encaminha notificações de apps financeiros confiáveis (Nubank, Caju, Mercado
 * Pago, XP) e de wallets (Samsung/Google Wallet) para o back-end do Fluxo, que
 * decide o que fazer com cada uma (ver lib/auto-transactions.ts no site).
 *
 * Roda como um serviço do sistema, independente do app estar aberto — por
 * isso toda a lógica de negócio (dedup, confiança, categorização) fica no
 * servidor: este serviço só encaminha o texto bruto da notificação.
 *
 * Exige que o usuário libere manualmente em Ajustes > Apps > Acesso especial
 * > Acesso a notificações (não existe diálogo de permissão em runtime para
 * isso — é por isso que existe NotificationBridgeModule.openSettings()).
 */
class NotificationForwarderService : NotificationListenerService() {

  companion object {
    private const val PREFS_NAME = "fluxo_notification_bridge"
    private const val KEY_BASE_URL = "base_url"
    private const val KEY_DEVICE_TOKEN = "device_token"

    // Mantém sincronizado com WALLET_PACKAGE_KEYWORDS / TRUSTED_APP_KEYWORDS
    // em lib/auto-transactions.ts — filtragem aqui é só para poupar rede e
    // bateria; a decisão de confiança de verdade é sempre do servidor.
    private val RELEVANT_PACKAGE_KEYWORDS = listOf(
      "nu.production", "nubank",
      "caju.mobile", "com.caju",
      "mercadopago",
      "xpi.app", "xp.com",
      "samsung.android.spay", "samsung.android.spaylite", "samsung.android.rewards",
      "google.android.apps.wallet",
    )

    fun credentials(context: Context): Pair<String, String>? {
      val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      val baseUrl = prefs.getString(KEY_BASE_URL, null)
      val token = prefs.getString(KEY_DEVICE_TOKEN, null)
      if (baseUrl.isNullOrEmpty() || token.isNullOrEmpty()) return null
      return baseUrl to token
    }
  }

  private val executor = Executors.newSingleThreadExecutor()

  override fun onNotificationPosted(sbn: StatusBarNotification) {
    val packageName = sbn.packageName ?: return
    if (packageName == applicationContext.packageName) return
    val normalized = packageName.lowercase()
    if (RELEVANT_PACKAGE_KEYWORDS.none { normalized.contains(it) }) return

    val extras: android.os.Bundle = sbn.notification.extras ?: return
    val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString().orEmpty()
    val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString().orEmpty()
    val bigText = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString().orEmpty()
    val rawText = listOf(title, bigText.ifEmpty { text }).filter { it.isNotBlank() }.joinToString(" — ")
    if (rawText.isBlank()) return

    val postedAtIso = isoTimestamp(sbn.postTime)
    executor.execute { forward(packageName, rawText, postedAtIso) }
  }

  private fun isoTimestamp(epochMillis: Long): String {
    val format = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US)
    format.timeZone = java.util.TimeZone.getTimeZone("UTC")
    return format.format(java.util.Date(epochMillis))
  }

  private fun forward(packageName: String, rawText: String, postedAtIso: String) {
    val (baseUrl, token) = credentials(applicationContext) ?: return
    try {
      val url = URL("${baseUrl.trimEnd('/')}/api/v1/auto-transactions")
      val connection = (url.openConnection() as HttpURLConnection).apply {
        requestMethod = "POST"
        doOutput = true
        connectTimeout = 8000
        readTimeout = 8000
        setRequestProperty("content-type", "application/json")
        setRequestProperty("authorization", "Bearer $token")
      }
      val body = JSONObject().apply {
        put("packageName", packageName)
        put("rawText", rawText)
        put("postedAt", postedAtIso)
      }
      OutputStreamWriter(connection.outputStream).use { it.write(body.toString()) }
      connection.inputStream.use { it.readBytes() }
      connection.disconnect()
    } catch (error: Exception) {
      // Melhor esforço: se a rede falhar, a notificação simplesmente não é
      // encaminhada. Não há fila de retentativa — o usuário sempre pode
      // lançar manualmente pelo app caso um lançamento não apareça.
    }
  }
}
