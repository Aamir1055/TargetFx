import { scheduleTokenRefresh } from './api'

// WebSocket service for real-time broker data updates
const DEBUG_LOGS = import.meta?.env?.VITE_DEBUG_LOGS === 'true'
const dlog = (...args) => { if (DEBUG_LOGS) console.log(...args) }
const dwarn = (...args) => { if (DEBUG_LOGS) console.warn(...args) }

// Decode JWT expiry (seconds since epoch) without a library
const getTokenExp = (token) => {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return payload.exp
  } catch {
    return null
  }
}

const isTokenExpired = () => {
  const token = localStorage.getItem('access_token')
  if (!token) return true
  const exp = getTokenExp(token)
  if (!exp) return true
  return Math.floor(Date.now() / 1000) >= exp
}

class WebSocketService {
  constructor() {
    this.ws = null
    this.reconnectAttempts = 0
    this.maxReconnectAttempts = 10
    this.reconnectDelay = 1000 // Start with 1 second
    this.maxReconnectDelay = 30000 // Max 30 seconds
    this.listeners = new Map()
    this.connectionState = 'disconnected' // disconnected, connecting, connected
    this.stateListeners = []
    this.lastMessage = null
    this.messageCount = 0
    this.heartbeatInterval = null
    this.heartbeatTimeout = null
    this.missedHeartbeats = 0
    this.maxMissedHeartbeats = 3
    this.reconnectTimer = null

    // After a token refresh, always reconnect the WebSocket with the fresh token
    // (the server may close the old connection when the URL token expires)
    try {
      window.addEventListener('auth:token_refreshed', () => {
        console.log('[WebSocket] Token refreshed — reconnecting with new token')
        this.reconnectAttempts = 0 // reset backoff
        if (this.ws) {
          // Close existing connection; onclose will NOT auto-reconnect because
          // we use code 1000 (clean close). We reconnect explicitly below.
          try { this.ws.close(1000, 'Token refreshed') } catch {}
          this.ws = null
        }
        this.stopHeartbeat()
        this.connect()
      })
    } catch {}
  }

  // Get WebSocket URL with token
  getWebSocketUrl() {
    try {
      const token = localStorage.getItem('access_token')
      if (!token) {
        dwarn('[WebSocket] No access token found in localStorage')
        return null
      }
      // Prefer same-origin in dev; in prod use configured base or default
      const base = import.meta?.env?.DEV
        ? ''
        : (import.meta?.env?.VITE_API_BASE_URL || 'https://api.brokereye.app.work.gd')
      // Force wss for https pages; otherwise use ws
      const wsProtocol = (window.location.protocol === 'https:' || base.startsWith('https')) ? 'wss' : 'ws'
      const wsHost = base.replace(/^https?:\/\//, '')
      const wsBase = wsHost ? `${wsProtocol}://${wsHost}` : `${wsProtocol}://${window.location.host}`
      return `${wsBase}/api/broker/ws?token=${encodeURIComponent(token)}`
    } catch (error) {
      console.error('[WebSocket] Error getting WebSocket URL:', error)
      return null
    }
  }

  // Connect to WebSocket
  connect() {
    const url = this.getWebSocketUrl()
    if (!url) {
      console.error('[WebSocket] Cannot connect: No valid WebSocket URL')
      this.setConnectionState('failed')
      return false
    }

    if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
      dlog('[WebSocket] Already connected or connecting')
      return true
    }

    // Clean up existing connection if closed
    if (this.ws && this.ws.readyState === WebSocket.CLOSED) {
      this.ws = null
    }

    this.setConnectionState('connecting')

    try {
      this.ws = new WebSocket(url)

      this.ws.onopen = () => {
        dlog('[WebSocket] Connected successfully')
        this.reconnectAttempts = 0
        this.missedHeartbeats = 0
        this.reconnectDelay = 1000 // Reset delay on successful connection
        this.setConnectionState('connected')
        this.startHeartbeat()
      }

      this.ws.onmessage = (event) => {
        try {
          // Handle empty or invalid messages
          if (!event || !event.data) {
            console.warn('[WebSocket] Received empty message')
            return
          }

          const data = JSON.parse(event.data)
          
          // Store last valid message
          this.lastMessage = data
          this.messageCount++
          
          // Reset heartbeat on any message
          this.missedHeartbeats = 0
          
          // Handle heartbeat/ping messages
          if (data.type === 'ping' || data.type === 'pong') {
            dlog('[WebSocket] Heartbeat received')
            return
          }
          
          // Support both 'type' and 'event' fields
          const messageType = data.type || data.event
          
          if (!messageType) {
            console.warn('[WebSocket] Message received without type or event field:', data)
          }
          
          dlog(`[WebSocket] Message received - Type: ${messageType}`, data)

          // Notify listeners subscribed to this message type
          if (messageType) {
            const listeners = this.listeners.get(messageType) || []
            listeners.forEach(callback => {
              try {
                callback(data)
              } catch (error) {
                console.error(`[WebSocket] Error in listener for '${messageType}':`, error)
              }
            })
          }

          // Always notify 'all' listeners
          const allListeners = this.listeners.get('all') || []
          allListeners.forEach(callback => {
            try {
              callback(data)
            } catch (error) {
              console.error('[WebSocket] Error in all listener:', error)
            }
          })
        } catch (error) {
          console.error('[WebSocket] Failed to parse message:', error)
          if (DEBUG_LOGS) console.error('[WebSocket] Raw message data:', event?.data)
        }
      }

      this.ws.onerror = (error) => {
        if (DEBUG_LOGS) console.error('[WebSocket] Connection error:', error)
        // Don't set state to 'error' immediately, let onclose handle reconnection
        // This prevents double state changes
      }

      this.ws.onclose = (event) => {
        dwarn(`[WebSocket] Connection closed - Code: ${event.code}, Reason: ${event.reason || 'Unknown'}, Clean: ${event.wasClean}`)
        this.stopHeartbeat()
        this.ws = null // Clean up the WebSocket object
        
        // Only reconnect if not a clean close or user-initiated disconnect
        if (this.reconnectAttempts < this.maxReconnectAttempts && (!event.wasClean || event.code !== 1000)) {
          this.setConnectionState('disconnected')
          this.attemptReconnect()
        } else if (event.wasClean && event.code === 1000) {
          // Clean disconnect, don't reconnect
          this.setConnectionState('disconnected')
          dlog('[WebSocket] Clean disconnect - not reconnecting')
        } else {
          // Max attempts reached
          this.setConnectionState('failed')
        }
      }
      return true
    } catch (error) {
      console.error('[WebSocket] Error creating WebSocket connection:', error)
      this.setConnectionState('error')
      this.ws = null
      this.attemptReconnect()
      return false
    }
  }

  // Attempt to reconnect with exponential backoff
  attemptReconnect() {
    // Clear existing timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[WebSocket] Max reconnection attempts reached')
      this.setConnectionState('failed')
      return
    }

    this.reconnectAttempts++
    
    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s (max)
    const delay = Math.min(
      this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
      this.maxReconnectDelay
    )
    
    dlog(`[WebSocket] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`)
    this.setConnectionState('connecting')

    this.reconnectTimer = setTimeout(async () => {
      // If the access token is expired, refresh it before reconnecting
      if (isTokenExpired()) {
        console.log('[WebSocket] Access token expired — triggering refresh before reconnect')
        try {
          // Import doRefresh dynamically to trigger a refresh; on success
          // the 'auth:token_refreshed' event fires and reconnects the WS.
          scheduleTokenRefresh()
          return // scheduleTokenRefresh (with 0 delay) will refresh → event → reconnect
        } catch (err) {
          console.error('[WebSocket] Token refresh failed during reconnect:', err?.message)
          // doRefresh already calls doLogout on failure, so just bail
          return
        }
      }

      dlog('[WebSocket] Attempting to reconnect...')
      const connected = this.connect()
      if (!connected && this.reconnectAttempts < this.maxReconnectAttempts) {
        // If connection failed immediately, try again
        this.attemptReconnect()
      }
    }, delay)
  }

  // Disconnect WebSocket
  disconnect() {
    dlog('[WebSocket] Disconnecting...')
    
    // Clear timers
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    
    this.stopHeartbeat()
    
    // Reset reconnect attempts
    this.reconnectAttempts = this.maxReconnectAttempts
    
    if (this.ws) {
      this.ws.close(1000, 'User initiated disconnect')
      this.ws = null
    }
    this.setConnectionState('disconnected')
  }

  // Subscribe to WebSocket messages
  subscribe(messageType, callback) {
    if (!messageType || typeof messageType !== 'string') {
      console.error('[WebSocket] Invalid message type for subscription:', messageType)
      return () => {} // Return empty unsubscribe function
    }

    if (typeof callback !== 'function') {
      console.error('[WebSocket] Invalid callback for subscription:', callback)
      return () => {} // Return empty unsubscribe function
    }

    if (!this.listeners.has(messageType)) {
      this.listeners.set(messageType, [])
    }
    this.listeners.get(messageType).push(callback)

  dlog(`[WebSocket] Subscribed to '${messageType}' (${this.listeners.get(messageType).length} listeners)`)

    // Return unsubscribe function
    return () => {
      const listeners = this.listeners.get(messageType)
      if (listeners) {
        const index = listeners.indexOf(callback)
        if (index > -1) {
          listeners.splice(index, 1)
          dlog(`[WebSocket] Unsubscribed from '${messageType}' (${listeners.length} listeners remaining)`)
        }
      }
    }
  }

  // Subscribe to connection state changes
  onConnectionStateChange(callback) {
    if (typeof callback !== 'function') {
      console.error('[WebSocket] Invalid callback for state change listener:', callback)
      return () => {} // Return empty unsubscribe function
    }

    this.stateListeners.push(callback)
    
    // Immediately notify of current state
    try {
      callback(this.connectionState)
    } catch (error) {
      console.error('[WebSocket] Error in initial state callback:', error)
    }

    // Return unsubscribe function
    return () => {
      const index = this.stateListeners.indexOf(callback)
      if (index > -1) {
        this.stateListeners.splice(index, 1)
      }
    }
  }

  // Set connection state and notify listeners
  setConnectionState(state) {
    this.connectionState = state
    this.stateListeners.forEach(callback => {
      try {
        callback(state)
      } catch (error) {
        console.error('Error in state listener:', error)
      }
    })
  }

  // Get current connection state
  getConnectionState() {
    return this.connectionState
  }

  // Get debug info
  getDebugInfo() {
    return {
      state: this.connectionState,
      reconnectAttempts: this.reconnectAttempts,
      messageCount: this.messageCount,
      lastMessage: this.lastMessage,
      subscriberCount: Array.from(this.listeners.entries()).map(([type, listeners]) => ({
        type,
        count: listeners.length
      }))
    }
  }

  // Send message (if needed)
  send(data) {
    try {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        const message = JSON.stringify(data)
        this.ws.send(message)
        return true
      }
      dwarn('[WebSocket] Cannot send message - not connected')
      return false
    } catch (error) {
      console.error('[WebSocket] Error sending message:', error, data)
      return false
    }
  }
  
  // Start heartbeat mechanism
  startHeartbeat() {
    this.stopHeartbeat()
    
    // Don't send pings - backend doesn't support them and returns "Unknown command" error
    // Instead, just monitor for incoming messages
  dlog('[WebSocket] Heartbeat monitoring started (receive-only mode)')
    
    // Monitor connection health by checking for any messages
    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        // Connection is still open, that's good enough
        // We receive ACCOUNT_UPDATED messages frequently anyway
      } else {
        // Connection lost, stop heartbeat
        dwarn('[WebSocket] Connection lost during heartbeat check')
        this.stopHeartbeat()
      }
    }, 30000)
  }
  
  // Stop heartbeat mechanism
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }
    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout)
      this.heartbeatTimeout = null
    }
    this.missedHeartbeats = 0
  }
  
  // Check if connected
  isConnected() {
    return this.ws && this.ws.readyState === WebSocket.OPEN
  }
  
  // Reset reconnection attempts (useful after successful reconnect or manual retry)
  resetReconnectAttempts() {
    this.reconnectAttempts = 0
  }
}

// Create singleton instance
const websocketService = new WebSocketService()

export default websocketService
