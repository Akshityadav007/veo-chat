import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { Socket } from 'socket.io';
import { User } from '../models/User';

// Extend Request interface to include userId
declare global {
  namespace Express {
    interface Request {
      userId: string;
    }
  }
}

// Extend Socket interface for userId
interface AuthenticatedSocket extends Socket {
  userId: string;
}

// JWT token verification for HTTP routes
export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Access token required' });
      return;
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    if (!token) {
      res.status(401).json({ error: 'Access token required' });
      return;
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
    
    if (decoded.type !== 'access') {
      res.status(401).json({ error: 'Invalid token type' });
      return;
    }

    // Check if user exists
    const user = await User.findById(decoded.userId).select('_id isPhoneVerified');
    
    if (!user) {
      res.status(401).json({ error: 'Invalid token - user not found' });
      return;
    }

    if (!user.isPhoneVerified) {
      res.status(401).json({ error: 'Phone number not verified' });
      return;
    }

    // Update user's last seen and online status
    await user.updateLastSeen();

    req.userId = decoded.userId;
    next();

  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({ error: 'Token expired' });
      return;
    }
    
    if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }

    console.error('Authentication error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Optional authentication - doesn't fail if no token
export const optionalAuthenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      next();
      return;
    }

    const token = authHeader.substring(7);
    
    if (!token) {
      next();
      return;
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
    
    if (decoded.type !== 'access') {
      next();
      return;
    }

    const user = await User.findById(decoded.userId).select('_id isPhoneVerified');
    
    if (user && user.isPhoneVerified) {
      await user.updateLastSeen();
      req.userId = decoded.userId;
    }

    next();

  } catch (error) {
    // Silent fail for optional auth
    next();
  }
};

// Socket.IO authentication middleware
export const authenticateSocket = async (
  socket: Socket,
  next: (err?: Error) => void
): Promise<void> => {
  try {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization;
    
    if (!token) {
      return next(new Error('Authentication token required'));
    }

    // Remove 'Bearer ' prefix if present
    const cleanToken = token.startsWith('Bearer ') ? token.substring(7) : token;

    // Verify token
    const decoded = jwt.verify(cleanToken, process.env.JWT_SECRET!) as any;
    
    if (decoded.type !== 'access') {
      return next(new Error('Invalid token type'));
    }

    // Check if user exists
    const user = await User.findById(decoded.userId).select('_id isPhoneVerified');
    
    if (!user) {
      return next(new Error('Invalid token - user not found'));
    }

    if (!user.isPhoneVerified) {
      return next(new Error('Phone number not verified'));
    }

    // Update user's online status
    await user.updateLastSeen();

    // Add userId to socket
    (socket as AuthenticatedSocket).userId = decoded.userId;
    
    next();

  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return next(new Error('Token expired'));
    }
    
    if (error instanceof jwt.JsonWebTokenError) {
      return next(new Error('Invalid token'));
    }

    console.error('Socket authentication error:', error);
    return next(new Error('Authentication failed'));
  }
};

// Admin authentication middleware
export const authenticateAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // First run regular authentication
    await authenticate(req, res, () => {});
    
    if (!req.userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    // Check if user is admin (you can add admin field to User model)
    const user = await User.findById(req.userId).select('_id isAdmin');
    
    if (!user) {
      res.status(401).json({ error: 'User not found' });
      return;
    }

    // For now, assuming first user or specific phone numbers are admins
    // You can modify this logic based on your needs
    const adminPhoneNumbers = process.env.ADMIN_PHONE_NUMBERS?.split(',') || [];
    const userWithPhone = await User.findById(req.userId).select('fullPhoneNumber');
    
    if (!userWithPhone || !adminPhoneNumbers.includes(userWithPhone.fullPhoneNumber)) {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    next();

  } catch (error) {
    console.error('Admin authentication error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Middleware to check if user owns the resource
export const authorizeResourceOwner = (resourceUserIdField = 'userId') => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const resourceUserId = req.params[resourceUserIdField] || req.body[resourceUserIdField];
      
      if (!resourceUserId) {
        res.status(400).json({ error: 'Resource user ID not provided' });
        return;
      }

      if (req.userId !== resourceUserId) {
        res.status(403).json({ error: 'Access denied - not resource owner' });
        return;
      }

      next();

    } catch (error) {
      console.error('Authorization error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
};

// Rate limiting by user ID
export const createUserRateLimiter = (options: {
  windowMs: number;
  max: number;
  message?: string;
}) => {
  const userRequestCounts = new Map<string, { count: number; resetTime: number }>();

  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.userId) {
      return next();
    }

    const now = Date.now();
    const userKey = req.userId;
    const userLimit = userRequestCounts.get(userKey);

    if (!userLimit || now > userLimit.resetTime) {
      // Reset or initialize counter
      userRequestCounts.set(userKey, {
        count: 1,
        resetTime: now + options.windowMs
      });
      return next();
    }

    if (userLimit.count >= options.max) {
      res.status(429).json({
        error: options.message || 'Too many requests from this user',
        retryAfter: Math.ceil((userLimit.resetTime - now) / 1000)
      });
      return;
    }

    userLimit.count += 1;
    userRequestCounts.set(userKey, userLimit);
    next();
  };
};

export type { AuthenticatedSocket };