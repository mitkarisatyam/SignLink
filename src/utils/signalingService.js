/**
 * src/utils/signalingService.js
 * 
 * Replaced Custom SSE Signaling with PeerJS Cloud DataConnections.
 * Uses a host/guest fallback mechanism to create a "room" out of a PeerJS point-to-point connection.
 */

import { Peer } from 'peerjs';

export class SignalingService {
  constructor(roomId, peerId, onMessage) {
    this.roomId = roomId;
    this.peerId = peerId; // App-level internal peerId
    this.onMessage = onMessage;
    
    this.seenMsgIds = new Set();
    this.isDestroyed = false;
    this.listeners = new Map();
    this.connections = new Map(); // stores active PeerJS DataConnections
    this.pendingMessages = [];

    // Derive deterministic PeerJS IDs based on the roomId
    this.hostId = `signlink-room-${roomId}-host`;
    this.guestId = `signlink-room-${roomId}-guest`;

    this._initializePeerJS();
  }

  _initializePeerJS() {
    // 1. Attempt to connect as the Host
    this.peer = new Peer(this.hostId, {
      debug: 1, // minimal logs
    });

    this.peer.on('open', (id) => {
      console.log('[SIGNALING] Connected to PeerJS Cloud as Host:', id);
    });

    // If another Host already exists (unavailable-id), we must be the Guest
    this.peer.on('error', (err) => {
      if (err.type === 'unavailable-id') {
        console.log('[SIGNALING] Host already exists, switching to Guest mode...');
        this.peer.destroy();

        // 2. Connect as Guest
        this.peer = new Peer(this.guestId, { debug: 1 });
        
        this.peer.on('open', (id) => {
          console.log('[SIGNALING] Connected to PeerJS Cloud as Guest:', id);
          
          // The Guest must actively initiate the data connection to the Host
          const conn = this.peer.connect(this.hostId, { reliable: true });
          this._setupDataConnection(conn);
        });

        this.peer.on('connection', (conn) => {
          this._setupDataConnection(conn);
        });

        this.peer.on('error', (guestErr) => {
          console.error('[SIGNALING] PeerJS Guest Error:', guestErr);
        });
      } else {
        console.error('[SIGNALING] PeerJS Error:', err);
      }
    });

    // If we are the Host, listen for the Guest connecting to us
    this.peer.on('connection', (conn) => {
      this._setupDataConnection(conn);
    });
  }

  _setupDataConnection(conn) {
    conn.on('open', () => {
      console.log('[SIGNALING] Data connection established with', conn.peer);
      this.connections.set(conn.peer, conn);

      // Prevent SDP collisions: Only the Guest announces joining
      if (!this.isHost && this.wantsToJoin) {
        this.send({ type: 'peer_joined', sender: this.peerId });
      }

      // Flush any messages that were sent before the connection opened
      while (this.pendingMessages.length > 0) {
        const msg = this.pendingMessages.shift();
        conn.send(msg);
      }
    });

    conn.on('data', (data) => {
      this._handleIncoming(data);
    });

    conn.on('close', () => {
      console.log('[SIGNALING] Data connection closed with', conn.peer);
      this.connections.delete(conn.peer);
    });
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
    this.wantsToJoin = true;
    
    // If the data connection is already open and we are the Guest, announce immediately
    if (!this.isHost && this.connections.size > 0) {
      this.send({ type: 'peer_joined', sender: this.peerId });
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

    if (this.connections.size === 0) {
      // If we are not connected yet, queue the message
      this.pendingMessages.push(payload);
      return;
    }

    // Broadcast via PeerJS DataConnection
    for (const [_, conn] of this.connections.entries()) {
      if (conn.open) {
        conn.send(payload);
      } else {
        this.pendingMessages.push(payload);
      }
    }
  }

  destroy() {
    this.isDestroyed = true;
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }
    this.connections.clear();
    this.seenMsgIds.clear();
  }
}
