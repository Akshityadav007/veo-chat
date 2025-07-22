import express from 'express';
import jwt from 'jsonwebtoken';
import Joi from 'joi';
import rateLimit from 'express-rate-limit';
import { User, OTPVerification } from '../models/User';
import { sendOTP, generateOTP } from '../utils/sms';
import { authenticate } from '../middleware/auth';

const router = express.Router();

// Rate limiting for OTP endpoints
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // limit each phone number to 3 OTP requests per windowMs
  message: 'Too many OTP requests, please try again later.',
  keyGenerator: (req) => req.body.fullPhoneNumber || req.ip,
});

// Rate limiting for verification
const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each phone number to 10 verification attempts per windowMs
  message: 'Too many verification attempts, please try again later.',
  keyGenerator: (req) => req.body.fullPhoneNumber || req.ip,
});

// Validation schemas
const phoneSchema = Joi.object({
  phoneNumber: Joi.string().pattern(/^\d{10,15}$/).required(),
  countryCode: Joi.string().pattern(/^\+\d{1,4}$/).required()
});

const verifyOTPSchema = Joi.object({
  fullPhoneNumber: Joi.string().pattern(/^\+\d{1,4}\d{10,15}$/).required(),
  otp: Joi.string().length(6).pattern(/^\d+$/).required()
});

const updateProfileSchema = Joi.object({
  displayName: Joi.string().min(1).max(50).trim(),
  bio: Joi.string().max(150).trim(),
  avatar: Joi.string().uri().allow('')
});

// Generate JWT tokens
const generateTokens = (userId: string) => {
  const accessToken = jwt.sign(
    { userId, type: 'access' },
    process.env.JWT_SECRET!,
    { expiresIn: process.env.JWT_EXPIRES_IN || '30d' }
  );

  const refreshToken = jwt.sign(
    { userId, type: 'refresh' },
    process.env.REFRESH_TOKEN_SECRET!,
    { expiresIn: '7d' }
  );

  return { accessToken, refreshToken };
};

// Send OTP to phone number
router.post('/send-otp', otpLimiter, async (req, res) => {
  try {
    const { error } = phoneSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ 
        error: 'Invalid phone number format',
        details: error.details[0].message
      });
    }

    const { phoneNumber, countryCode } = req.body;
    const fullPhoneNumber = `${countryCode}${phoneNumber}`;

    // Check if user already has a pending OTP
    const existingOTP = await OTPVerification.findOne({
      phoneNumber: fullPhoneNumber,
      expiresAt: { $gt: new Date() },
      verified: false
    });

    if (existingOTP && existingOTP.attempts >= 3) {
      return res.status(429).json({ 
        error: 'Too many OTP attempts. Please try again later.' 
      });
    }

    // Generate new OTP
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + (parseInt(process.env.OTP_EXPIRES_IN!) || 300000)); // 5 minutes

    // Delete any existing OTP for this phone number
    await OTPVerification.deleteMany({ phoneNumber: fullPhoneNumber });

    // Save new OTP
    const otpVerification = new OTPVerification({
      phoneNumber: fullPhoneNumber,
      otp,
      expiresAt
    });

    await otpVerification.save();

    // Send OTP via SMS
    const smsResult = await sendOTP(fullPhoneNumber, otp);
    
    if (!smsResult.success) {
      await OTPVerification.deleteOne({ _id: otpVerification._id });
      return res.status(500).json({ 
        error: 'Failed to send OTP. Please try again.' 
      });
    }

    res.status(200).json({
      message: 'OTP sent successfully',
      fullPhoneNumber,
      expiresIn: Math.floor((expiresAt.getTime() - Date.now()) / 1000) // seconds
    });

  } catch (error) {
    console.error('Send OTP error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Verify OTP and login/register
router.post('/verify-otp', verifyLimiter, async (req, res) => {
  try {
    const { error } = verifyOTPSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ 
        error: 'Invalid input format',
        details: error.details[0].message
      });
    }

    const { fullPhoneNumber, otp } = req.body;

    // Find OTP verification record
    const otpRecord = await OTPVerification.findOne({
      phoneNumber: fullPhoneNumber,
      expiresAt: { $gt: new Date() },
      verified: false
    });

    if (!otpRecord) {
      return res.status(400).json({ 
        error: 'OTP expired or not found. Please request a new one.' 
      });
    }

    // Check attempt limit
    if (otpRecord.attempts >= 3) {
      return res.status(429).json({ 
        error: 'Too many failed attempts. Please request a new OTP.' 
      });
    }

    // Verify OTP
    if (otpRecord.otp !== otp) {
      otpRecord.attempts += 1;
      await otpRecord.save();
      
      return res.status(400).json({ 
        error: 'Invalid OTP',
        attemptsLeft: 3 - otpRecord.attempts
      });
    }

    // Mark OTP as verified
    otpRecord.verified = true;
    await otpRecord.save();

    // Find or create user
    let user = await User.findByPhoneNumber(fullPhoneNumber);
    let isNewUser = false;

    if (!user) {
      // Extract phone number and country code
      const phoneMatch = fullPhoneNumber.match(/^(\+\d{1,4})(\d{10,15})$/);
      if (!phoneMatch) {
        return res.status(400).json({ error: 'Invalid phone number format' });
      }

      const [, countryCode, phoneNumber] = phoneMatch;

      user = new User({
        phoneNumber,
        countryCode,
        fullPhoneNumber,
        isPhoneVerified: true
      });
      
      await user.save();
      isNewUser = true;
    } else {
      // Update existing user
      user.isPhoneVerified = true;
      user.lastSeen = new Date();
      await user.save();
    }

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user._id);

    // Clean up OTP records for this phone
    await OTPVerification.deleteMany({ phoneNumber: fullPhoneNumber });

    res.status(200).json({
      message: isNewUser ? 'Registration successful' : 'Login successful',
      user: {
        id: user._id,
        phoneNumber: user.phoneNumber,
        countryCode: user.countryCode,
        fullPhoneNumber: user.fullPhoneNumber,
        displayName: user.displayName,
        avatar: user.avatar,
        bio: user.bio,
        isPhoneVerified: user.isPhoneVerified,
        createdAt: user.createdAt
      },
      tokens: {
        accessToken,
        refreshToken
      },
      isNewUser
    });

  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Refresh token
router.post('/refresh-token', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token required' });
    }

    // Verify refresh token
    const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET!) as any;
    
    if (decoded.type !== 'refresh') {
      return res.status(400).json({ error: 'Invalid token type' });
    }

    // Find user
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Generate new tokens
    const tokens = generateTokens(user._id);

    res.status(200).json({
      message: 'Tokens refreshed successfully',
      tokens
    });

  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ error: 'Refresh token expired' });
    }
    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }
    console.error('Refresh token error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user profile
router.get('/profile', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('-__v');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.status(200).json({
      user: {
        id: user._id,
        phoneNumber: user.phoneNumber,
        countryCode: user.countryCode,
        fullPhoneNumber: user.fullPhoneNumber,
        displayName: user.displayName,
        avatar: user.avatar,
        bio: user.bio,
        isOnline: user.isOnline,
        lastSeen: user.lastSeen,
        isPhoneVerified: user.isPhoneVerified,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update user profile
router.put('/profile', authenticate, async (req, res) => {
  try {
    const { error } = updateProfileSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ 
        error: 'Invalid input',
        details: error.details[0].message
      });
    }

    const updates = req.body;
    const user = await User.findByIdAndUpdate(
      req.userId,
      { ...updates, updatedAt: new Date() },
      { new: true, runValidators: true }
    ).select('-__v');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.status(200).json({
      message: 'Profile updated successfully',
      user: {
        id: user._id,
        phoneNumber: user.phoneNumber,
        countryCode: user.countryCode,
        fullPhoneNumber: user.fullPhoneNumber,
        displayName: user.displayName,
        avatar: user.avatar,
        bio: user.bio,
        isOnline: user.isOnline,
        lastSeen: user.lastSeen,
        isPhoneVerified: user.isPhoneVerified,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Logout
router.post('/logout', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (user) {
      await user.setOffline();
    }

    res.status(200).json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;