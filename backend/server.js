// backend/server.js - Defensive id-based room server

const http = require('http');
const WebSocket = require('ws');

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }
  if (req.url === '/health') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() })); return; }
  res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('WebSocket Signaling Server');
});

const wss = new WebSocket.Server({ server, perMessageDeflate: false, clientTracking: true });

// Data structures
const rooms = new Map();          // roomId -> Set<clientId>
const clientsById = new Map();    // clientId -> ws
const clientsByWs = new Map();    // ws -> { id, room }

function safeSend(ws, msg) {
  try {
    if (ws && ws.readyState === WebSocket.OPEN) { ws.send(JSON.stringify(msg)); return true; }
  } catch (e) { console.error('safeSend error', e); }
  return false;
}

function logRoomState(room) {
  const set = rooms.get(room);
  console.log(`Room ${room} members: ${set ? Array.from(set).join(', ') : '(none)'}`);
}

function cleanupClient(ws, reason = 'unknown') {
  const info = clientsByWs.get(ws);
  if (!info) return;
  const { id, room } = info;
  console.log(`Cleaning up client ${id} (reason=${reason})`);
  if (room) leaveRoomById(id, room);
  clientsByWs.delete(ws);
  clientsById.delete(id);
}

wss.on('connection', (ws, req) => {
  const clientId = Math.random().toString(36).substring(2, 9);
  clientsByWs.set(ws, { id: clientId, room: null });
  clientsById.set(clientId, ws);

  console.log(`Client connected: ${clientId} from ${req.socket.remoteAddress}`);
  safeSend(ws, { type: 'client-id', clientId });

  // ping/pong keepalive
  let isAlive = true;
  ws.on('pong', () => { isAlive = true; });
  const pingInterval = setInterval(() => {
    if (!isAlive) {
      clearInterval(pingInterval);
      return ws.terminate();
    }
    isAlive = false;
    try { ws.ping(); } catch (e) { /* ignore */ }
  }, 30_000);

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch (e) { console.warn('invalid json'); return; }
    // heartbeat support
    if (msg && msg.type === 'heartbeat') {
      try { ws.send(JSON.stringify({ type: 'pong', ts: Date.now() })); } catch(e) {}
      return;
    }
    const info = clientsByWs.get(ws);
    if (!info) return;
    const from = msg.from || info.id;
    console.log(`Message from ${from}:`, msg.type);

    switch (msg.type) {
      case 'join-room': return handleJoinRoomByWs(ws, msg.room);
      case 'leave-room': return leaveRoomById(from, msg.room || info.room);
      case 'offer':
      case 'answer':
      case 'ice-candidate':
        return handleSignaling(from, msg);
      default:
        console.log('Unknown type', msg.type);
    }
  });

  ws.on('close', (code, reason) => {
    console.log(`Client disconnected: ${clientId} code=${code} reason=${reason}`);
    clearInterval(pingInterval);
    cleanupClient(ws, `close-${code}`);
  });


  ws.on('close', () => { clearInterval(pingInterval); });
  ws.on('error', () => { clearInterval(pingInterval); });

  ws.on('error', (err) => {
    console.error(`WS error for ${clientId}:`, err);
    clearInterval(pingInterval);
    cleanupClient(ws, 'error');
  });
});

/* ========== Room logic ========== */

function normalizeRoom(room) {
  if (!room) return null;
  return String(room).trim().toUpperCase();
}

function handleJoinRoomByWs(ws, rawRoom) {
  const room = normalizeRoom(rawRoom);
  if (!room) { console.warn('join-room missing/invalid room'); return; }

  const info = clientsByWs.get(ws);
  if (!info) return;

  // If already in the same room, ignore
  if (info.room === room) {
    console.log(`Client ${info.id} attempted to re-join same room ${room} -> ignoring`);
    safeSend(ws, { type: 'joined', peers: Array.from(rooms.get(room) || []).filter(id => id !== info.id), room });
    return;
  }

  // Leave previous room (if any)
  if (info.room) leaveRoomById(info.id, info.room);

  info.room = room;
  if (!rooms.has(room)) rooms.set(room, new Set());
  const roomSet = rooms.get(room);

  // existing peers BEFORE adding
  const existingPeers = Array.from(roomSet);

  // send joined to joining client
  safeSend(ws, { type: 'joined', peers: existingPeers, room });

  // add into room
  roomSet.add(info.id);

  // notify others about new peer
  for (const peerId of roomSet) {
    if (peerId === info.id) continue;
    const peerWs = clientsById.get(peerId);
    if (peerWs) safeSend(peerWs, { type: 'peer-joined', peerId: info.id, room });
  }

  console.log(`Client ${info.id} joined room ${room} (size=${roomSet.size})`);
  logRoomState(room);
}

function leaveRoomById(clientId, rawRoom) {
  const room = normalizeRoom(rawRoom);
  if (!room) { console.warn('leave-room missing/invalid room'); return; }

  const roomSet = rooms.get(room);
  if (!roomSet) { console.log(`leave-room: room ${room} not found`); return; }
  if (!roomSet.has(clientId)) { console.log(`leave-room: client ${clientId} not in room ${room} -> ignoring`); return; }

  roomSet.delete(clientId);

  // update clientsByWs if available
  const ws = clientsById.get(clientId);
  if (ws && clientsByWs.has(ws)) clientsByWs.get(ws).room = null;

  // notify remaining
  for (const peerId of roomSet) {
    const peerWs = clientsById.get(peerId);
    if (peerWs) safeSend(peerWs, { type: 'peer-left', peerId: clientId, room });
  }

  if (roomSet.size === 0) {
    rooms.delete(room);
    console.log(`Room ${room} deleted (empty)`);
  } else {
    console.log(`Client ${clientId} left room ${room} (size=${roomSet.size})`);
  }
  logRoomState(room);
}

/* ========== Signaling ========== */
function handleSignaling(from, msg) {
  if (!msg.target) { console.warn('signaling missing target'); return; }
  const targetWs = clientsById.get(msg.target);
  if (targetWs && targetWs.readyState === WebSocket.OPEN) {
    safeSend(targetWs, { ...msg, from });
    console.log(`Relayed ${msg.type} from ${from} -> ${msg.target}`);
  } else {
    console.log(`Target ${msg.target} not available`);
  }
}

/* ===== start server ===== */
const PORT = process.env.PORT || 8888;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 WebSocket server running on 0.0.0.0:${PORT}`);
});


