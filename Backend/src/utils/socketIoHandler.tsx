import { Server, Socket } from 'socket.io';
import { User } from '../models/User';
import { Chat, Message } from '../models/Chat';
import { AuthenticatedSocket } from '../middleware/auth';

// Store active user connections
const activeUsers = new Map<string, string>(); // userId -> socketId
const userSockets = new Map<string, Socket>(); // socketId -> socket

export const setupSocketHandlers = (socket: AuthenticatedSocket, io: Server) => {
  const userId = socket.userId;
  
  console.log(`Setting up handlers for user: ${userId}`);
  
  // Store user connection
  activeUsers.set(userId, socket.id);
  userSockets.set(socket.id, socket);

  // Join user to their personal room
  socket.join(`user:${userId}`);
  
  // Update user online status
  updateUserOnlineStatus(userId, true);

  // Handle joining chat rooms
  socket.on('join-chat', async (data: { chatId: string }) => {
    try {
      const { chatId } = data;
      
      // Verify user is participant in this chat
      const chat = await Chat.findOne({
        _id: chatId,
        participants: userId,
        isActive: true
      });

      if (!chat) {
        socket.emit('error', { message: 'Chat not found or access denied' });
        return;
      }

      // Join chat room
      socket.join(`chat:${chatId}`);
      
      // Mark messages as delivered for this user
      await Message.updateMany(
        {
          chatId,
          senderId: { $ne: userId },
          'deliveredTo.userId': { $ne: userId }
        },
        {
          $push: {
            deliveredTo: {
              userId,
              deliveredAt: new Date()
            }
          }
        }
      );

      socket.emit('joined-chat', { chatId, message: 'Successfully joined chat' });
      
      // Notify other participants that user is active
      socket.to(`chat:${chatId}`).emit('user-joined-chat', {
        chatId,
        userId,
        timestamp: new Date()
      });

    } catch (error) {
      console.error('Join chat error:', error);
      socket.emit('error', { message: 'Failed to join chat' });
    }
  });

  // Handle leaving chat rooms
  socket.on('leave-chat', async (data: { chatId: string }) => {
    try {
      const { chatId } = data;
      
      socket.leave(`chat:${chatId}`);
      
      socket.to(`chat:${chatId}`).emit('user-left-chat', {
        chatId,
        userId,
        timestamp: new Date()
      });

    } catch (error) {
      console.error('Leave chat error:', error);
    }
  });

  // Handle sending messages
  socket.on('send-message', async (data: {
    chatId: string;
    content: string;
    messageType?: string;
    replyTo?: string;
    fileUrl?: string;
    fileName?: string;
    fileSize?: number;
    mimeType?: string;