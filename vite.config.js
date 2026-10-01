import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

function signalingPlugin() {
  const rooms = new Map(); // roomId -> Map<peerId, res>

  return {
    name: 'signlink-signaling',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url || '/', 'http://localhost');

        if (url.pathname.startsWith('/api/signaling/')) {
          // Enable CORS
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

          if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
          }

          // SSE Stream endpoint
          if (url.pathname === '/api/signaling/stream') {
            const roomId = url.searchParams.get('roomId');
            const peerId = url.searchParams.get('peerId');

            if (!roomId || !peerId) {
              res.writeHead(400, { 'Content-Type': 'text/plain' });
              res.end('Missing roomId or peerId');
              return;
            }

            res.writeHead(200, {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              'Connection': 'keep-alive',
            });
            res.write(': connected\n\n');

            if (!rooms.has(roomId)) {
              rooms.set(roomId, new Map());
            }
            const peerMap = rooms.get(roomId);
            peerMap.set(peerId, res);

            req.on('close', () => {
              peerMap.delete(peerId);
              if (peerMap.size === 0) {
                rooms.delete(roomId);
              }
            });
            return;
          }

          // Message sending endpoint
          if (url.pathname === '/api/signaling/send' && req.method === 'POST') {
            let body = '';
            req.on('data', (chunk) => { body += chunk; });
            req.on('end', () => {
              try {
                const data = JSON.parse(body);
                const { roomId, fromPeerId, toPeerId, message } = data;
                const peerMap = rooms.get(roomId);
                if (peerMap) {
                  const sseData = `data: ${JSON.stringify({ fromPeerId, message })}\n\n`;
                  for (const [pId, peerRes] of peerMap.entries()) {
                    if (pId !== fromPeerId && (!toPeerId || toPeerId === pId)) {
                      try {
                        peerRes.write(sseData);
                      } catch (err) {
                        console.error('[SIGNALING] Write error:', err);
                      }
                    }
                  }
                }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true }));
              } catch (err) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
              }
            });
            return;
          }
        }
        next();
      });
    }
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), signalingPlugin()],
})

