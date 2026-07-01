import { Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt';
import { AuthenticatedRequest } from '../types';

/**
 * JWT authentication middleware.
 * Verifies the Authorization: Bearer <token> header
 * and attaches the userId to the request object.
 */
export function authenticateToken(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Authorization header missing or invalid. Expected: Bearer <token>' });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const payload = verifyToken(token);
    req.userId = payload.userId;
    next();
  } catch (err) {
    if (err instanceof Error && err.name === 'TokenExpiredError') {
      res.status(401).json({ success: false, error: 'Token expired. Please log in again.' });
      return;
    }
    res.status(401).json({ success: false, error: 'Invalid token. Please log in again.' });
  }
}

/**
 * API Key authentication middleware for webhook endpoints.
 * Verifies the X-API-Key header against the sites table.
 */
export async function authenticateApiKey(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const apiKey = req.headers['x-api-key'] as string;

  if (!apiKey) {
    res.status(401).json({ success: false, error: 'X-API-Key header missing' });
    return;
  }

  // Attach apiKey to request for route handlers
  (req as AuthenticatedRequest & { apiKey: string }).apiKey = apiKey;
  next();
}

// Extend type for API key
export interface ApiKeyRequest extends AuthenticatedRequest {
  apiKey: string;
}
