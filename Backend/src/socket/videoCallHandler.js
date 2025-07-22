// socket/videoCallHandler.js
const handleVideoCall = (io) => {
  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    
    // Store user socket
    userSockets.set(socket.id, socket);
    
    // Handle joining a room
    socket.on('join-room', ({ roomId, userId, userName }) => {
      socket.join(roomId);
      socket.userId = userId;
      socket.userName = userName;
      socket.roomId = roomId;
      
      // Initialize room if it doesn't exist
      if (!activeRooms.has(roomId)) {
        activeRooms.set(roomId, {
          users: new Map(),
          createdAt: new Date()
        });
      }
      
      const room = activeRooms.get(roomId);
      room.users.set(socket.id, {
        userId,
        userName,
        socketId: socket.id,
        joinedAt: new Date()
      });
      
      // Notify existing users about new user
      socket.to(roomId).emit('user-joined', {
        userId,
        userName,
        socketId: socket.id
      });
      
      // Send existing users list to new user
      const existingUsers = Array.from(room.users.values())
        .filter(user => user.socketId !== socket.id);
      
      socket.emit('existing-users', existingUsers);
      
      console.log(`User ${userName} joined room ${roomId}`);
    });
    
    // Handle WebRTC offer
    socket.on('offer', ({ offer, targetSocketId }) => {
      socket.to(targetSocketId).emit('offer', {
        offer,
        callerSocketId: socket.id,
        callerName: socket.userName
      });
    });
    
    // Handle WebRTC answer
    socket.on('answer', ({ answer, callerSocketId }) => {
      socket.to(callerSocketId).emit('answer', {
        answer,
        answererSocketId: socket.id
      });
    });
    
    // Handle ICE candidates
    socket.on('ice-candidate', ({ candidate, targetSocketId }) => {
      socket.to(targetSocketId).emit('ice-candidate', {
        candidate,
        senderSocketId: socket.id
      });
    });
    
    // Handle mute/unmute audio
    socket.on('toggle-audio', ({ isAudioMuted }) => {
      if (socket.roomId) {
        socket.to(socket.roomId).emit('user-audio-toggle', {
          userId: socket.userId,
          socketId: socket.id,
          isAudioMuted
        });
      }
    });
    
    // Handle mute/unmute video
    socket.on('toggle-video', ({ isVideoMuted }) => {
      if (socket.roomId) {
        socket.to(socket.roomId).emit('user-video-toggle', {
          userId: socket.userId,
          socketId: socket.id,
          isVideoMuted
        });
      }
    });
    
    // Handle screen sharing
    socket.on('start-screen-share', () => {
      if (socket.roomId) {
        socket.to(socket.roomId).emit('user-screen-share-start', {
          userId: socket.userId,
          socketId: socket.id,
          userName: socket.userName
        });
      }
    });
    
    socket.on('stop-screen-share', () => {
      if (socket.roomId) {
        socket.to(socket.roomId).emit('user-screen-share-stop', {
          userId: socket.userId,
          socketId: socket.id
        });
      }
    });
    
    // Handle leaving room
    socket.on('leave-room', () => {
      handleUserLeave(socket);
    });
    
    // Handle disconnect
    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);
      handleUserLeave(socket);
      userSockets.delete(socket.id);
    });
  });
};

const handleUserLeave = (socket) => {
  if (socket.roomId && activeRooms.has(socket.roomId)) {
    const room = activeRooms.get(socket.roomId);
    room.users.delete(socket.id);
    
    // Notify other users
    socket.to(socket.roomId).emit('user-left', {
      userId: socket.userId,
      socketId: socket.id,
      userName: socket.userName
    });
    
    // Clean up empty rooms
    if (room.users.size === 0) {
      activeRooms.delete(socket.roomId);
      console.log(`Room ${socket.roomId} deleted (empty)`);
    }
    
    socket.leave(socket.roomId);
  }
};

module.exports = { handleVideoCall };