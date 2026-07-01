import jwt from 'jsonwebtoken';
import { config } from '../config';
import { JWTPayload } from '../types';

export function generateToken(userId: string): string {
  return jwt.sign({ userId } as JWTPayload, config.jwt.secret, {
    algorithm: 'HS256',
    expiresIn: config.jwt.expiresIn,
  });
}

export function verifyToken(token: string): JWTPayload {
  return jwt.verify(token, config.jwt.secret, {
    algorithms: ['HS256'],
  }) as JWTPayload;
}

export function decodeToken(token: string): JWTPayload | null {
  try {
    return jwt.decode(token) as JWTPayload | null;
  } catch {
    return null;
  }
}
