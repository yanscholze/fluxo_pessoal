package com.fluxo.pessoal.notifications

import android.app.Notification
import android.content.Context
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import org.json.JSONArray
import org.json.JSONObject

/**
 * Encaminha notificações de apps financeiros para `POST /api/v1/captures`.
 *
 * Este serviço **não** interpreta nada: ele manda o texto bruto e para por aí.
 * Quem decide se aquilo é uma transação, de quanto, de qual estabelecimento e
 * se é repetida é `core/domain/capture/notification.ts`, no servidor — a mesma
 * implementação que o site usa. Interpretar aqui criaria uma segunda regra em
 * Kotlin, que divergiria da primeira no primeiro banco que mudasse o texto.
 *
 * Roda como serviço do sistema, com o aplicativo fechado. Por isso escreve
 * direto na rede em vez de usar a fila SQLite do aplicativo: abrir o mesmo
 * banco de dois processos pediria coordenação que não vale o ganho.
 *
 * Exige liberação manual em Ajustes > Apps > Acesso especial > Acesso a
 * notificações — não existe diálogo em runtime para isso, e é por isso que
 * `NotificationBridgeModule.openSettings()` existe.
 */
class NotificationForwarderService : NotificationListenerService() {

  companion object {
    private const val PREFS_NAME = "fluxo_notification_bridge"
    private const val KEY_BASE_URL = "base_url"
    private const val KEY_DEVICE_TOKEN = "device_token"

    /**
     * Filtro grosseiro, só para poupar rede e bateria. A decisão de confiança
     * de verdade é sempre do servidor: um app novo que o usuário liberar lá
     * precisa apenas constar aqui para chegar, e a regra de negócio continua
     * num lugar só.
     */
    private val RELEVANT_PACKAGE_KEYWORDS = listOf(
      "nu.production", "nubank",
      "caju.mobile", "com.caju",
      "mercadopago",
      "xpi.app", "xp.com",
      "itau", "bradesco", "santander", "bb.android", "caixa",
      "inter", "c6bank", "picpay", "willbank", "neon",
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

    // O texto expandido, quando existe, traz o valor e o estabelecimento
    // completos; o resumido às vezes corta.
    val body = bigText.ifBlank { text }
    if (body.isBlank() && title.isBlank()) return

    // Identidade estável do evento: o mesmo aviso reenviado depois de uma
    // resposta perdida não pode virar duas sugestões. `sbn.key` distingue
    // notificações simultâneas do mesmo app; `postTime` distingue reedições.
    val deviceEventId = "${sbn.key ?: packageName}:${sbn.postTime}".take(120)

    executor.execute { forward(packageName, title, body, sbn.postTime, deviceEventId) }
  }

  private fun forward(
    packageName: String,
    title: String,
    text: String,
    postedAt: Long,
    deviceEventId: String,
  ) {
    val (baseUrl, token) = credentials(applicationContext) ?: return
    try {
      val url = URL("${baseUrl.trimEnd('/')}/api/v1/captures")
      val connection = (url.openConnection() as HttpURLConnection).apply {
        requestMethod = "POST"
        doOutput = true
        connectTimeout = 8000
        readTimeout = 8000
        setRequestProperty("content-type", "application/json")
        setRequestProperty("accept", "application/json")
        setRequestProperty("authorization", "Bearer $token")
      }

      val notificacao = JSONObject().apply {
        put("sourceApp", packageName)
        put("title", title)
        put("text", text)
        put("postedAt", postedAt)
        put("deviceEventId", deviceEventId)
      }
      val body = JSONObject().apply { put("notifications", JSONArray().put(notificacao)) }

      OutputStreamWriter(connection.outputStream, Charsets.UTF_8).use { it.write(body.toString()) }
      connection.inputStream.use { it.readBytes() }
      connection.disconnect()
    } catch (error: Exception) {
      // Melhor esforço. Se a rede falhar, a notificação não é encaminhada e o
      // usuário lança manualmente — não existe fila de retentativa aqui de
      // propósito: guardar dado financeiro num serviço de sistema que roda
      // fora do controle do aplicativo custa mais do que resolve.
    }
  }
}
