import mongoose, { Document, Schema, Types } from 'mongoose';

// Chat interfaces
export interface IChat extends Document {
  _id: string;
  participants: string[];
  type: 'direct' | 'group';
  name?: string;
  description?: string;
  avatar?: string;
  adminIds: string[];
  lastMessage?: string;
  lastMessageAt?: Date;
  lastMessageBy?: string;
  createdBy: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Message interfaces
export interface IMessage extends Document {
  _id: string;
  chatId: string;
  senderId: string;
  content: string;
  messageType: 'text' | 'image' | 'file' | 'audio' | 'video' | 'location' | 'contact';
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  thumbnailUrl?: string;
  duration?: number; // for audio/video
  location?: {
    latitude: number;
    longitude: number;
    address?: string;
  };
  contact?: {
    name: string;
    phoneNumber: string;
  };
  replyTo?: string; // messageId being replied to
  readBy: Array<{
    userId: string;
    readAt: Date;
  }>;
  deliveredTo: Array<{
    userId: string;
    deliveredAt: Date;
  }>;
  isEdited: boolean;
  editedAt?: Date;
  isDeleted: boolean;
  deletedAt?: Date;
  deletedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Chat Schema
const chatSchema = new Schema<IChat>({
  participants: [{
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }],
  type: {
    type: String,
    enum: ['direct', 'group'],
    required: true,
    default: 'direct'
  },
  name: {
    type: String,
    trim: true,
    maxlength: 100,
    // Required for group chats
    required: function(this: IChat) {
      return this.type === 'group';
    }
  },
  description: {
    type: String,
    trim: true,
    maxlength: 500
  },
  avatar: {
    type: String,
    default: null
  },
  adminIds: [{
    type: Schema.Types.ObjectId,
    ref: 'User'
  }],
  lastMessage: {
    type: String,
    default: null
  },
  lastMessageAt: {
    type: Date,
    default: null
  },
  lastMessageBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for Chat
chatSchema.index({ participants: 1 });
chatSchema.index({ type: 1 });
chatSchema.index({ lastMessageAt: -1 });
chatSchema.index({ isActive: 1 });
chatSchema.index({ createdAt: -1 });

// Virtual for participant count
chatSchema.virtual('participantCount').get(function(this: IChat) {
  return this.participants.length;
});

// Pre-save middleware for chat
chatSchema.pre('save', function(this: IChat, next) {
  // Ensure creator is admin for group chats
  if (this.type === 'group' && !this.adminIds.includes(this.createdBy)) {
    this.adminIds.push(this.createdBy);
  }
  
  // Ensure creator is participant
  if (!this.participants.includes(this.createdBy)) {
    this.participants.push(this.createdBy);
  }
  
  next();
});

// Static methods for Chat
chatSchema.statics.findDirectChat = function(userId1: string, userId2: string) {
  return this.findOne({
    type: 'direct',
    participants: { $all: [userId1, userId2] },
    isActive: true
  });
};

chatSchema.statics.findUserChats = function(userId: string) {
  return this.find({
    participants: userId,
    isActive: true
  }).populate('participants', 'displayName avatar phoneNumber isOnline lastSeen')
    .sort({ lastMessageAt: -1 });
};

// Message Schema
const messageSchema = new Schema<IMessage>({
  chatId: {
    type: Schema.Types.ObjectId,
    ref: 'Chat',
    required: true,
    index: true
  },
  senderId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  content: {
    type: String,
    required: true,
    maxlength: 5000
  },
  messageType: {
    type: String,
    enum: ['text', 'image', 'file', 'audio', 'video', 'location', 'contact'],
    default: 'text',
    required: true
  },
  fileUrl: {
    type: String,
    default: null
  },
  fileName: {
    type: String,
    trim: true,
    maxlength: 255
  },
  fileSize: {
    type: Number,
    min: 0
  },
  mimeType: {
    type: String,
    trim: true
  },
  thumbnailUrl: {
    type: String,
    default: null
  },
  duration: {
    type: Number,
    min: 0
  },
  location: {
    latitude: {
      type: Number,
      min: -90,
      max: 90
    },
    longitude: {
      type: Number,
      min: -180,
      max: 180
    },
    address: {
      type: String,
      trim: true,
      maxlength: 500
    }
  },
  contact: {
    name: {
      type: String,
      trim: true,
      maxlength: 100
    },
    phoneNumber: {
      type: String,
      trim: true
    }
  },
  replyTo: {
    type: Schema.Types.ObjectId,
    ref: 'Message',
    default: null
  },
  readBy: [{
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    readAt: {
      type: Date,
      default: Date.now
    }
  }],
  deliveredTo: [{
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    deliveredAt: {
      type: Date,
      default: Date.now
    }
  }],
  isEdited: {
    type: Boolean,
    default: false
  },
  editedAt: {
    type: Date,
    default: null
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: {
    type: Date,
    default: null
  },
  deletedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    default: null
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for Message
messageSchema.index({ chatId: 1, createdAt: -1 });
messageSchema.index({ senderId: 1 });
messageSchema.index({ isDeleted: 1 });
messageSchema.index({ messageType: 1 });
messageSchema.index({ createdAt: -1 });

// Virtual for read status
messageSchema.virtual('isRead').get(function(this: IMessage) {
  return this.readBy.length > 0;
});

// Instance methods for Message
messageSchema.methods.markAsRead = function(this: IMessage, userId: string) {
  const alreadyRead = this.readBy.some(read => read.userId.toString() === userId);
  if (!alreadyRead) {
    this.readBy.push({ userId: userId as any, readAt: new Date() });
    return this.save();
  }
  return Promise.resolve(this);
};

messageSchema.methods.markAsDelivered = function(this: IMessage, userId: string) {
  const alreadyDelivered = this.deliveredTo.some(delivery => delivery.userId.toString() === userId);
  if (!alreadyDelivered) {
    this.deliveredTo.push({ userId: userId as any, deliveredAt: new Date() });
    return this.save();
  }
  return Promise.resolve(this);
};

messageSchema.methods.softDelete = function(this: IMessage, deletedBy?: string) {
  this.isDeleted = true;
  this.deletedAt = new Date();
  if (deletedBy) {
    this.deletedBy = deletedBy as any;
  }
  return this.save();
};

// Static methods for Message
messageSchema.statics.findChatMessages = function(
  chatId: string, 
  page = 1, 
  limit = 50,
  includeDeleted = false
) {
  const query = includeDeleted ? { chatId } : { chatId, isDeleted: false };
  
  return this.find(query)
    .populate('senderId', 'displayName avatar phoneNumber')
    .populate('replyTo', 'content senderId messageType')
    .sort({ createdAt: -1 })
    .limit(limit * 1)
    .skip((page - 1) * limit);
};

messageSchema.statics.getUnreadCount = function(chatId: string, userId: string) {
  return this.countDocuments({
    chatId,
    senderId: { $ne: userId },
    isDeleted: false,
    'readBy.userId': { $ne: userId }
  });
};

// Pre-save middleware for message
messageSchema.pre('save', async function(this: IMessage, next) {
  // Update chat's last message info
  if (this.isNew && !this.isDeleted) {
    await mongoose.model('Chat').findByIdAndUpdate(this.chatId, {
      lastMessage: this.content.length > 100 ? this.content.substring(0, 100) + '...' : this.content,
      lastMessageAt: this.createdAt,
      lastMessageBy: this.senderId
    });
  }
  next();
});

// Post-save middleware to handle delivery status
messageSchema.post('save', async function(this: IMessage) {
  if (this.isNew && !this.isDeleted) {
    // Auto-mark as delivered to sender
    await this.markAsDelivered(this.senderId.toString());
  }
});

export const Chat = mongoose.model<IChat>('Chat', chatSchema);
export const Message = mongoose.model<IMessage>('Message', messageSchema);