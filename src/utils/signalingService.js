/**
 * src/utils/signalingService.js
 * 
 * Hybrid Signaling Service for WebRTC:
 * 1. BroadcastChannel: Instant zero-latency cross-tab communication in same browser.
 * 2. Vite SSE/HTTP: Real-time signaling across different browsers/devices.
 * 
 * Built-in message deduplication and targeted peer routing.
 */

export class SignalingService {
  constructor(roomId, peerId, onMessage) {
    this.roomId = roomId;
    this.peerId = peerId;
    this.onMessage = onMessage;
    this.seenMsgIds = new Set();
    this.isDestroyed = false;
    this.listeners = new Map();

    // 1. BroadcastChannel (fast local cross-window signaling)
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        this.bc = new BroadcastChannel(`signlink_room_${roomId}`);
        this.bc.onmessage = (event) => {
          this._handleIncoming(event.data);
        };
      } catch (err) {
        console.warn('[SIGNALING] BroadcastChannel init error:', err);
      }
    }

    // 2. Server-Sent Events (SSE) for cross-browser / network signaling
    this._connectSSE();
  }

  on(event, handler) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(handler);
    return () => this.off(event, handler);
  }

  off(event, handler) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(handler);
    }
  }

  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach((fn) => {
        try {
          fn(data);
        } catch (e) {
          console.error(`[SIGNALING] Error in listener for ${event}:`, e);
        }
      });
    }
  }

  join() {
    // Notify peers in the room that this peer has joined
    this.send({ type: 'peer_joined', sender: this.peerId });
  }

  _connectSSE() {
    if (typeof window === 'undefined' || !window.EventSource) return;

    try {
      const sseUrl = `/api/signaling/stream?roomId=${encodeURIComponent(this.roomId)}&peerId=${encodeURIComponent(this.peerId)}`;
      this.eventSource = new EventSource(sseUrl);

      this.eventSource.onmessage = (event) => {
        if (!event.data) return;
        try {
          const parsed = JSON.parse(event.data);
          // Format from server: { fromPeerId, message }
          if (parsed && parsed.message) {
            this._handleIncoming(parsed.message);
          }
        } catch (err) {
          console.warn('[SIGNALING] SSE parse error:', err);
        }
      };

      this.eventSource.onerror = (err) => {
        // SSE auto-reconnects; no action required
      };
    } catch (err) {
      console.warn('[SIGNALING] EventSource connection error:', err);
    }
  }

  _handleIncoming(payload) {
    if (!payload || typeof payload !== 'object' || this.isDestroyed) return;

    const { msgId, fromPeerId, toPeerId, message } = payload;

    // Ignore self-messages
    if (fromPeerId === this.peerId) return;

    // Ignore messages targeted to a different peer
    if (toPeerId && toPeerId !== this.peerId) return;

    // Deduplicate
    if (msgId) {
      if (this.seenMsgIds.has(msgId)) return;
      this.seenMsgIds.add(msgId);
      // Keep set bounded
      if (this.seenMsgIds.size > 500) {
        const oldest = this.seenMsgIds.values().next().value;
        this.seenMsgIds.delete(oldest);
      }
    }

    if (this.onMessage) {
      this.onMessage(message, fromPeerId);
    }

    if (message && typeof message === 'object' && message.type) {
      this.emit(message.type, { ...message, sender: fromPeerId });
      if (message.type === 'leave') {
        this.emit('peer_left', { sender: fromPeerId });
      }
    }
  }

  send(message, toPeerId = null) {
    if (this.isDestroyed) return;

    const msgId = `${this.peerId}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const payload = {
      msgId,
      fromPeerId: this.peerId,
      toPeerId,
      message,
      timestamp: Date.now()
    };

    // 1. Broadcast locally
    if (this.bc) {
      try {
        this.bc.postMessage(payload);
      } catch (err) {
        console.warn('[SIGNALING] BroadcastChannel postMessage error:', err);
      }
    }

    // 2. Broadcast via Vite HTTP signaling API (for cross-browser or LAN)
    try {
      fetch('/api/signaling/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId: this.roomId,
          fromPeerId: this.peerId,
          toPeerId,
          message: payload
        })
      }).catch(() => {
        // Silent catch for dev mode
      });
    } catch {}
  }

  destroy() {
    this.isDestroyed = true;
    if (this.bc) {
      try {
        this.bc.close();
      } catch {}
      this.bc = null;
    }
    if (this.eventSource) {
      try {
        this.eventSource.close();
      } catch {}
      this.eventSource = null;
    }
    this.seenMsgIds.clear();
  }
}
