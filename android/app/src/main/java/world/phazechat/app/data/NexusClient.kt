package world.phazechat.app.data

import android.util.Log
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import okhttp3.*
import org.json.JSONObject

enum class ConnState { DISCONNECTED, CONNECTING, CONNECTED }

class NexusClient(private val scope: CoroutineScope) {

    companion object {
        private const val TAG = "NexusClient"
        private const val WS_URL = "wss://phazechat.world/ws"
        private const val MAX_RETRY_DELAY = 30_000L
    }

    private val client = OkHttpClient.Builder()
        .pingInterval(java.time.Duration.ofSeconds(30))
        .build()

    // The socket we currently own. Callbacks from any other (older) socket
    // are ignored, so a late onClosed/onFailure from a socket that was
    // already replaced can't flip the state or start a second reconnect loop.
    @Volatile private var ws: WebSocket? = null
    private var retryDelay = 1000L
    // Set by disconnect(): a socket closed on purpose must not reconnect.
    @Volatile private var closedByUser = false
    private var reconnectJob: Job? = null

    private val _state = MutableStateFlow(ConnState.DISCONNECTED)
    val state = _state.asStateFlow()

    private val _messages = MutableSharedFlow<NexusMessage>(extraBufferCapacity = 64)
    val messages = _messages.asSharedFlow()

    @Synchronized
    fun connect() {
        closedByUser = false
        reconnectJob?.cancel()
        reconnectJob = null
        if (ws != null) return // already connecting or connected
        _state.value = ConnState.CONNECTING

        val req = Request.Builder().url(WS_URL).build()
        ws = client.newWebSocket(req, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                if (webSocket !== ws) { webSocket.cancel(); return }
                Log.d(TAG, "Connected to Nexus")
                _state.value = ConnState.CONNECTED
                retryDelay = 1000L
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                if (webSocket !== ws) return
                try {
                    val msg = NexusMessage.fromJson(JSONObject(text))
                    scope.launch { _messages.emit(msg) }
                } catch (e: Exception) {
                    Log.w(TAG, "Parse error: ${e.message}")
                }
            }

            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                webSocket.close(1000, null)
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                Log.d(TAG, "WS closed: $code $reason")
                onSocketGone(webSocket)
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                Log.w(TAG, "WS failure: ${t.message}")
                onSocketGone(webSocket)
            }
        })
    }

    @Synchronized
    private fun onSocketGone(webSocket: WebSocket) {
        if (webSocket !== ws) return // stale: replaced, or closed by disconnect()
        ws = null
        _state.value = ConnState.DISCONNECTED
        if (!closedByUser) scheduleReconnect()
    }

    fun send(msg: NexusMessage) {
        ws?.send(msg.toJson().toString())
    }

    /** Closes the socket for good: nothing reconnects until [connect] is called again. */
    @Synchronized
    fun disconnect() {
        closedByUser = true
        reconnectJob?.cancel()
        reconnectJob = null
        val old = ws
        ws = null
        old?.close(1000, "bye")
        _state.value = ConnState.DISCONNECTED
    }

    @Synchronized
    private fun scheduleReconnect() {
        reconnectJob?.cancel()
        reconnectJob = scope.launch {
            delay(retryDelay)
            retryDelay = (retryDelay * 2).coerceAtMost(MAX_RETRY_DELAY)
            if (!closedByUser) connect()
        }
    }
}
