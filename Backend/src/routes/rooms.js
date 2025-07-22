// routes/rooms.js
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();

// In-memory storage (replace with database for production)
const rooms = new Map();

// Create a new room
router.post('/create', (req, res) => {
  try {
    const { hostName, roomName, isPrivate = false } = req.body;
    
    if (!hostName) {
      return res.status(400).json({ error: 'Host name is required' });
    }
    
    const roomId = uuidv4();
    const room = {
      id: roomId,
      name: roomName || `Room ${roomId.slice(0, 8)}`,
      hostName,
      isPrivate,
      createdAt: new Date(),
      participants: 0,
      maxParticipants: 8 // Configurable limit
    };
    
    rooms.set(roomId, room);
    
    res.status(201).json({
      roomId,
      roomName: room.name,
      hostName,
      joinUrl: `${process.env.CLIENT_URL}/room/${roomId}`
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create room' });
  }
});

// Get room info
router.get('/:roomId', (req, res) => {
  try {
    const { roomId } = req.params;
    const room = rooms.get(roomId);
    
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    
    // Get current participants from active rooms
    const activeRoom = activeRooms.get(roomId);
    const currentParticipants = activeRoom ? activeRoom.users.size : 0;
    
    res.json({
      ...room,
      participants: currentParticipants,
      isActive: activeRoom !== undefined
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get room info' });
  }
});

// Join room validation
router.post('/:roomId/join', (req, res) => {
  try {
    const { roomId } = req.params;
    const { userName } = req.body;
    
    if (!userName) {
      return res.status(400).json({ error: 'User name is required' });
    }
    
    const room = rooms.get(roomId);
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    
    const activeRoom = activeRooms.get(roomId);
    const currentParticipants = activeRoom ? activeRoom.users.size : 0;
    
    if (currentParticipants >= room.maxParticipants) {
      return res.status(400).json({ error: 'Room is full' });
    }
    
    res.json({
      success: true,
      roomInfo: {
        id: roomId,
        name: room.name,
        hostName: room.hostName,
        participants: currentParticipants
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to join room' });
  }
});

// Get active rooms (for admin/monitoring)
router.get('/', (req, res) => {
  try {
    const roomList = Array.from(rooms.values()).map(room => {
      const activeRoom = activeRooms.get(room.id);
      return {
        ...room,
        participants: activeRoom ? activeRoom.users.size : 0,
        isActive: activeRoom !== undefined
      };
    });
    
    res.json(roomList);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get rooms' });
  }
});

module.exports = router;