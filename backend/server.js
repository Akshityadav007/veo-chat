// backend/server.js - Fixed WebSocket Server

const http = require('http');
const WebSocket = require('ws');

// Create HTTP server
const server = http.createServer((req, res) => {
  // Enable CORS for all origins
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  // Simple health check endpoint
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
    return;
  }
  
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('WebSocket Signaling Server is running');
});

// Create WebSocket server
const wss = new WebSocket.Server({ 
  server,
  perMessageDeflate: false, // Disable compression for better compatibility
  clientTracking: true
});

// Store active connections
const rooms = new Map(); // roomId -> Set of client objects {id, ws}
const clients = new Map(); // ws -> {id, room}

// Helper function to send WebSocket messages safely
function send(ws, message) {
  try {
    if (ws.readyState === WebSocket.OPEN) {
      const messageStr = JSON.stringify(message);
      console.log('Sending message:', message.type, 'to client');
      ws.send(messageStr);
      return true;
    } else {
      console.log('WebSocket not open, cannot send message:', ws.readyState);
      return false;
    }
  } catch (e) {
    console.error('Failed to send message:', e);
    return false;
  }
}

// Clean up client connections
function cleanupClient(ws, reason = 'unknown') {
  const clientInfo = clients.get(ws);
  if (clientInfo) {
    console.log(`Cleaning up client ${clientInfo.id} (reason: ${reason})`);
    
    if (clientInfo.room) {
      leaveRoom(ws, clientInfo.room);
    }
    
    clients.delete(ws);
  }
}

// WebSocket connection handler
wss.on('connection', (ws, req) => {
  // Generate a unique ID for this client
  const clientId = Math.random().toString(36).substring(2, 9);
  const clientInfo = { id: clientId, room: null };
  clients.set(ws, clientInfo);
  
  console.log(`Client connected: ${clientId} from ${req.socket.remoteAddress}`);
  console.log(`Total clients: ${clients.size}`);

  // Send client their ID immediately
  const success = send(ws, { type: 'client-id', clientId });
  if (!success) {
    console.error('Failed to send client ID, closing connection');
    ws.close();
    return;
  }

  // Set up ping/pong for connection health
  let isAlive = true;
  
  ws.on('pong', () => {
    isAlive = true;
  });

  const pingInterval = setInterval(() => {
    if (!isAlive) {
      console.log(`Client ${clientId} failed ping test, terminating`);
      clearInterval(pingInterval);
      return ws.terminate();
    }
    
    isAlive = false;
    if (ws.readyState === WebSocket.OPEN) {
      ws.ping();
    }
  }, 30000); // Ping every 30 seconds

  // Message handler
  ws.on('message', (raw) => {
    let msg;
    try { 
      msg = JSON.parse(raw.toString()); 
    } catch(e) { 
      console.error('Invalid JSON message from client', clientId, ':', raw.toString());
      return; 
    }
    
    const currentClientInfo = clients.get(ws);
    if (!currentClientInfo) {
      console.error('Client info not found for message:', msg);
      return;
    }
    
    const from = msg.from || currentClientInfo.id;
    console.log(`Message received: ${msg.type} from ${from}`);

    switch (msg.type) {
      case 'join-room':
        handleJoinRoom(ws, msg, currentClientInfo);
        break;
        
      case 'leave-room':
        handleLeaveRoom(ws, msg, currentClientInfo);
        break;
        
      case 'offer':
      case 'answer':
      case 'ice-candidate':
        handleSignalingMessage(ws, msg, from);
        break;
        
      default:
        console.log(`Unknown message type: ${msg.type}`);
    }
  });

  // Connection close handler
  ws.on('close', (code, reason) => {
    console.log(`Client disconnected: ${clientId}, code: ${code}, reason: ${reason}`);
    clearInterval(pingInterval);
    cleanupClient(ws, `close-${code}`);
  });

  // Error handler
  ws.on('error', (error) => {
    console.error(`WebSocket error for client ${clientId}:`, error);
    clearInterval(pingInterval);
    cleanupClient(ws, 'error');
  });
});

// Handle join room requests
function handleJoinRoom(ws, msg, clientInfo) {
  const room = msg.room;
  const clientId = clientInfo.id;
  
  if (!room) {
    console.error('No room specified in join-room message');
    return;
  }
  
  console.log(`Client ${clientId} requesting to join room: ${room}`);
  
  // Leave current room if in one
  if (clientInfo.room) {
    leaveRoom(ws, clientInfo.room);
  }
  
  // Update client info
  clientInfo.room = room;
  
  // Create room if it doesn't exist
  if (!rooms.has(room)) {
    rooms.set(room, new Set());
    console.log(`Created new room: ${room}`);
  }
  
  const roomSet = rooms.get(room);
  
  // Get existing peers before adding new client
  const existingPeers = Array.from(roomSet).map(c => c.id);
  
  // Send 'joined' message with existing peers
  const joinedMessage = { 
    type: 'joined', 
    peers: existingPeers,
    room: room
  };
  
  const success = send(ws, joinedMessage);
  if (!success) {
    console.error(`Failed to send joined message to ${clientId}`);
    return;
  }
  
  console.log(`Sent joined message to ${clientId} with ${existingPeers.length} existing peers:`, existingPeers);
  
  // Notify existing clients about new peer
  for (const existingClient of roomSet) {
    send(existingClient.ws, { 
      type: 'peer-joined', 
      peerId: clientId,
      room: room
    });
  }
  
  // Add client to room
  roomSet.add({ id: clientId, ws });
  
  console.log(`Client ${clientId} successfully joined room ${room}. Room now has ${roomSet.size} clients.`);
}

// Handle leave room requests
function handleLeaveRoom(ws, msg, clientInfo) {
  const room = msg.room || clientInfo.room;
  if (room) {
    leaveRoom(ws, room);
  }
}

// Handle WebRTC signaling messages
function handleSignalingMessage(ws, msg, from) {
  if (!msg.target) {
    console.error('Signaling message missing target:', msg);
    return;
  }
  
  // Find target client by ID
  const targetWs = findWsByClientId(msg.target);
  if (targetWs) {
    const relayMessage = { ...msg, from };
    const success = send(targetWs, relayMessage);
    if (success) {
      console.log(`Relayed ${msg.type} from ${from} to ${msg.target}`);
    } else {
      console.error(`Failed to relay ${msg.type} from ${from} to ${msg.target}`);
    }
  } else {
    console.log(`Target client ${msg.target} not found for ${msg.type} from ${from}`);
  }
}

// Remove client from room
function leaveRoom(ws, room) {
  if (!room) return;
  
  const roomSet = rooms.get(room);
  if (!roomSet) return;
  
  const clientInfo = clients.get(ws);
  if (!clientInfo) return;
  
  const clientId = clientInfo.id;
  
  // Find and remove client from room
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
    for (const remainingClient of roomSet) {
      send(remainingClient.ws, { 
        type: 'peer-left', 
        peerId: clientId,
        room: room
      });
    }
    
    // Clean up empty rooms
    if (roomSet.size === 0) {
      rooms.delete(room);
      console.log(`Room ${room} deleted (empty)`);
    }
  }
  
  // Clear room from client info
  clientInfo.room = null;
}

// Find WebSocket by client ID
function findWsByClientId(clientId) {
  for (const [ws, info] of clients.entries()) {
    if (info.id === clientId && ws.readyState === WebSocket.OPEN) {
      return ws;
    }
  }
  return null;
}

// Server startup
const PORT = process.env.PORT || 8888;
const HOST = process.env.HOST || '0.0.0.0';

server.listen(PORT, HOST, (err) => {
  if (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
  
  console.log(`🚀 WebSocket signaling server running on ${HOST}:${PORT}`);
  console.log(`📡 WebSocket endpoint: ws://${HOST}:${PORT}`);
  console.log(`🏥 Health check: http://${HOST}:${PORT}/health`);
  console.log(`🌐 Use your local network IP address to connect from other devices`);
  console.log(`⏰ Server started at: ${new Date().toISOString()}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

// Error handling
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Log server stats periodically
setInterval(() => {
  console.log(`📊 Server stats - Clients: ${clients.size}, Rooms: ${rooms.size}`);
}, 60000); // Every minute