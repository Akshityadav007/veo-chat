import mongoose, { Document, Schema } from 'mongoose';

export interface IUser extends Document {
  _id: string;
  phoneNumber: string;
  countryCode: string;
  fullPhoneNumber: string;
  displayName?: string;
  avatar?: string;
  bio?: string;
  isOnline: boolean;
  lastSeen: Date;
  isPhoneVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
  
  // Virtual methods
  formattedPhoneNumber: string;
}

export interface IOTPVerification extends Document {
  phoneNumber: string;
  otp: string;
  expiresAt: Date;
  attempts: number;
  verified: boolean;
  createdAt: Date;
}

const userSchema = new Schema<IUser>({
  phoneNumber: {
    type: String,
    required: true,
    trim: true,
    minlength: 10,
    maxlength: 15
  },
  countryCode: {
    type: String,
    required: true,
    trim: true,
    match: /^\+\d{1,4}$/
  },
  fullPhoneNumber: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true
  },
  displayName: {
    type: String,
    trim: true,
    maxlength: 50,
    default: function(this: IUser) {
      return `User ${this.phoneNumber.slice(-4)}`;
    }
  },
  avatar: {
    type: String,
    default: null
  },
  bio: {
    type: String,
    maxlength: 150,
    default: 'Hey there! I am using Veo Chat.'
  },
  isOnline: {
    type: Boolean,
    default: false
  },
  lastSeen: {
    type: Date,
    default: Date.now
  },
  isPhoneVerified: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for formatted phone number
userSchema.virtual('formattedPhoneNumber').get(function(this: IUser) {
  return `${this.countryCode} ${this.phoneNumber}`;
});

// Indexes
userSchema.index({ fullPhoneNumber: 1 });
userSchema.index({ isOnline: 1 });
userSchema.index({ createdAt: -1 });

// Pre-save middleware
userSchema.pre('save', function(this: IUser, next) {
  if (this.isModified('phoneNumber') || this.isModified('countryCode')) {
    this.fullPhoneNumber = `${this.countryCode}${this.phoneNumber}`;
  }
  next();
});

// OTP Verification Schema
const otpVerificationSchema = new Schema<IOTPVerification>({
  phoneNumber: {
    type: String,
    required: true,
    index: true
  },
  otp: {
    type: String,
    required: true,
    length: 6
  },
  expiresAt: {
    type: Date,
    required: true,
    index: { expireAfterSeconds: 0 } // Auto-delete expired documents
  },
  attempts: {
    type: Number,
    default: 0,
    max: 3
  },
  verified: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Indexes for OTP
otpVerificationSchema.index({ phoneNumber: 1, createdAt: -1 });
otpVerificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Instance methods
userSchema.methods.updateLastSeen = function(this: IUser) {
  this.lastSeen = new Date();
  this.isOnline = true;
  return this.save();
};

userSchema.methods.setOffline = function(this: IUser) {
  this.isOnline = false;
  this.lastSeen = new Date();
  return this.save();
};

// Static methods
userSchema.statics.findByPhoneNumber = function(fullPhoneNumber: string) {
  return this.findOne({ fullPhoneNumber });
};

userSchema.statics.getOnlineUsers = function() {
  return this.find({ isOnline: true }).select('_id displayName avatar');
};

export const User = mongoose.model<IUser>('User', userSchema);
export const OTPVerification = mongoose.model<IOTPVerification>('OTPVerification', otpVerificationSchema);