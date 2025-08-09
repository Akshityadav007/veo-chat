// backend/server.js

const http = require('http');
const WebSocket = require('ws');
const server = http.createServer();
const wss = new WebSocket.Server({ server });

// Store active connections
const rooms = new Map(); // roomId -> Set of client objects {id, ws}
const clients = new Map(); // ws -> {id, room}

// Enable CORS for all origins
server.on('request', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
});

// Helper function to send WebSocket messages
function send(ws, message) {
  try {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  } catch (e) {
    console.error('Failed to send message:', e);
  }
}

wss.on('connection', (ws) => {
  // Generate a unique ID for this client
  const clientId = Math.random().toString(36).substring(2, 9);
  clients.set(ws, { id: clientId, room: null });
  console.log('Client connected:', clientId);

  // Send client their ID
  send(ws, { type: 'client-id', clientId });

  ws.on('message', (raw) => {
    let msg;
    try { 
      msg = JSON.parse(raw); 
    } catch(e) { 
      console.error('Invalid JSON message:', raw.toString());
      return; 
    }
    
    const clientInfo = clients.get(ws);
    if (!clientInfo) return;
    
    const from = msg.from || clientInfo.id;
    console.log('Message received:', msg.type, 'from:', from);

    if (msg.type === 'join-room') {
      const room = msg.room;
      clientInfo.room = room;
      
      if (!rooms.has(room)) rooms.set(room, new Set());
      const roomSet = rooms.get(room);
      
      // Send 'joined' message with existing peers
      const peers = Array.from(roomSet).map(c => c.id);
      send(ws, { type: 'joined', peers });
      console.log(`Sending joined message to ${from} with peers:`, peers);
      
      // Notify existing clients about new peer
      for (const client of roomSet) {
        send(client.ws, { type: 'peer-joined', peerId: from });
      }
      
      roomSet.add({ id: from, ws });
      console.log(`Client ${from} joined room ${room}. Room now has ${roomSet.size} clients.`);
      return;
    }

    if (msg.type === 'leave-room') {
      const room = msg.room || clientInfo.room;
      leaveRoom(ws, room);
      return;
    }

    // Relay WebRTC signaling messages: offer/answer/ice-candidate
    if (msg.target) {
      // Find target client by ID
      const target = findWsById(msg.target);
      if (target) {
        console.log(`Relaying ${msg.type} from ${from} to ${msg.target}`);
        send(target, { ...msg, from });
      } else {
        console.log(`Target client ${msg.target} not found`);
      }
    } else if (msg.room) {
      // Broadcast to room (shouldn't be used for WebRTC signaling, but keeping for compatibility)
      const roomSet = rooms.get(msg.room);
      if (roomSet) {
        for (const client of roomSet) {
          if (client.id === from) continue;
          send(client.ws, { ...msg, from });
        }
      }
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected:', clientId);
    const info = clients.get(ws);
    if (info && info.room) {
      console.log(`Cleaning up client ${clientId} from room ${info.room}`);
      leaveRoom(ws, info.room);
    }
    clients.delete(ws);
  });

  ws.on('error', (error) => {
    console.error('WebSocket error for client', clientId, ':', error);
  });
});

function leaveRoom(ws, room) {
  if (!room) return;
  
  const roomSet = rooms.get(room);
  if (!roomSet) return;
  
  const clientInfo = clients.get(ws) || {};
  const clientId = clientInfo.id;
  
  // Remove client from room
  let clientToRemove = null;
  for (const client of roomSet) {
    if (client.id === clientId) {
      clientToRemove = client;
      break;
    }
  }
  
  if (clientToRemove) {
    roomSet.delete(clientToRemove);
    console.log(`Client ${clientId} left room ${room}. Room now has ${roomSet.size} clients.`);
    
    // Notify others about peer leaving
    for (const client of roomSet) {
      send(client.ws, { type: 'peer-left', peerId: clientId });
    }
    
    // Clean up empty rooms
    if (roomSet.size === 0) {
      rooms.delete(room);
      console.log(`Room ${room} deleted (empty)`);
    }
  }
  
  // Clear room from client info
  if (clientInfo) {
    clientInfo.room = null;
  }
}

function findWsById(id) {
  for (const [ws, info] of clients.entries()) {
    if (info.id === id) return ws;
  }
  return null;
}

const PORT = process.env.PORT || 8888;
const HOST = '0.0.0.0';

server.listen(PORT, HOST, () => {
  console.log(`Signaling server running on ${HOST}:${PORT}`);
  console.log('Use your local network IP address to connect from other devices');
});