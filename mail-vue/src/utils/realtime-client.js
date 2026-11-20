// WebSocket connection to the worker's MailHub (GET /api/realtime). The
// server sends { type: 'new_mail', emailId, accountId } the moment a mail is
// stored; mail-sync-service turns that into the same path a web push takes.
// While the socket is up, the fallback poll drops to once every few minutes.
//
// The session token goes in the subprotocol list, not the URL. A 4401 close
// means the session is gone: stop until the next login instead of looping.

const PROTOCOL = 'psg-mail'
const PING_MS = 50_000
const MAX_BACKOFF_MS = 5 * 60_000
const CLOSE_UNAUTHORIZED = 4401

let socket = null
let handlers = null
let connected = false
let stopped = true
let retryTimer = null
let pingTimer = null
let attempt = 0

function realtimeUrl() {
  const base = import.meta.env.VITE_BASE_URL || '/api'
  const url = new URL(base.replace(/\/$/, '') + '/realtime', window.location.href)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
}

function clearTimers() {
  clearTimeout(retryTimer)
  clearInterval(pingTimer)
  retryTimer = null
  pingTimer = null
}

function setConnected(value) {
  if (connected === value) return
  connected = value
  handlers?.onStatus?.(value)
}

function scheduleReconnect() {
  if (stopped || retryTimer) return
  // 2 s, 4 s, 8 s ... capped at 5 min, with jitter so tabs don't sync up.
  const delay = Math.min(MAX_BACKOFF_MS, 2000 * 2 ** attempt) * (0.75 + Math.random() * 0.5)
  attempt += 1
  retryTimer = setTimeout(() => {
    retryTimer = null
    connect()
  }, delay)
}

function connect() {
  if (stopped || socket || typeof WebSocket === 'undefined') return
  const token = localStorage.getItem('token')
  if (!token) return
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    scheduleReconnect()
    return
  }

  let ws
  try {
    ws = new WebSocket(realtimeUrl(), [PROTOCOL, token])
  } catch {
    scheduleReconnect()
    return
  }
  socket = ws

  ws.onopen = () => {
    attempt = 0
    setConnected(true)
    clearInterval(pingTimer)
    // Some proxies drop silent connections; the server answers 'ping'
    // without waking up, so this keeps the line open for free.
    pingTimer = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send('ping')
    }, PING_MS)
  }

  ws.onmessage = (event) => {
    if (typeof event.data !== 'string' || event.data === 'pong') return
    let data
    try { data = JSON.parse(event.data) } catch { return }
    if (data?.type === 'new_mail' && data.emailId) handlers?.onNewMail?.(data)
  }

  ws.onclose = (event) => {
    if (socket === ws) socket = null
    clearInterval(pingTimer)
    pingTimer = null
    const wasConnected = connected
    setConnected(false)
    if (event.code === CLOSE_UNAUTHORIZED) {
      stopped = true
      return
    }
    // Missed hints while the socket was down are picked up by a catch-up sync.
    if (wasConnected) handlers?.onReconnectNeeded?.()
    scheduleReconnect()
  }

  ws.onerror = () => {
    // onclose follows and handles the retry.
  }
}

export function isRealtimeConnected() {
  return connected
}

export function startRealtime(callbacks) {
  handlers = callbacks
  if (!stopped) return
  stopped = false
  attempt = 0
  connect()
}

export function stopRealtime() {
  stopped = true
  clearTimers()
  const ws = socket
  socket = null
  setConnected(false)
  if (ws) {
    try { ws.close(1000, 'stop') } catch {}
  }
}

// After login/logout or a token change, open a fresh socket with the new token.
export function restartRealtime() {
  if (!handlers) return
  stopRealtime()
  startRealtime(handlers)
}

// Coming back online or to a visible tab: retry now instead of waiting out
// the backoff.
export function nudgeRealtime() {
  if (stopped || socket) return
  clearTimeout(retryTimer)
  retryTimer = null
  attempt = 0
  connect()
}
