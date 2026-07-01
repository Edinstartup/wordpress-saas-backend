import { Router, Request, Response } from 'express';
import { body } from 'express-validator';
import bcrypt from 'bcryptjs';
import { supabase } from '../db/supabase';
import { generateToken } from '../utils/jwt';
import { authenticateToken } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { AuthenticatedRequest } from '../types';

const router = Router();

/**
 * POST /api/auth/register
 * Register a new user with email and password.
 */
router.post(
  '/register',
  validate([
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  ]),
  async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;

      // Check if user already exists
      const { data: existingUser } = await supabase
        .from('users')
        .select('id')
        .eq('email', email)
        .single();

      if (existingUser) {
        res.status(409).json({ success: false, error: 'An account with this email already exists' });
        return;
      }

      // Hash password
      const password_hash = await bcrypt.hash(password, 12);

      // Create user
      const { data: user, error } = await supabase
        .from('users')
        .insert({ email, password_hash })
        .select('id, email')
        .single();

      if (error || !user) {
        console.error('Registration error:', error);
        res.status(500).json({ success: false, error: 'Failed to create account. Please try again.' });
        return;
      }

      // Generate JWT
      const token = generateToken(user.id);

      res.status(201).json({
        success: true,
        user: { id: user.id, email: user.email },
        token,
      });
    } catch (err) {
      console.error('Registration error:', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

/**
 * POST /api/auth/login
 * Authenticate user and return JWT token.
 */
router.post(
  '/login',
  validate([
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ]),
  async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;

      // Find user
      const { data: user, error } = await supabase
        .from('users')
        .select('id, email, password_hash')
        .eq('email', email)
        .single();

      if (error || !user) {
        res.status(401).json({ success: false, error: 'Invalid email or password' });
        return;
      }

      // Verify password
      const isValidPassword = await bcrypt.compare(password, user.password_hash);
      if (!isValidPassword) {
        res.status(401).json({ success: false, error: 'Invalid email or password' });
        return;
      }

      // Generate JWT
      const token = generateToken(user.id);

      res.status(200).json({
        success: true,
        user: { id: user.id, email: user.email },
        token,
      });
    } catch (err) {
      console.error('Login error:', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

/**
 * GET /api/auth/me
 * Return the current authenticated user's info.
 */
router.get('/me', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, created_at')
      .eq('id', req.userId!)
      .single();

    if (error || !user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    res.status(200).json({
      success: true,
      id: user.id,
      email: user.email,
      created_at: user.created_at,
    });
  } catch (err) {
    console.error('Get user error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

export default router;
