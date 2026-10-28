import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { UserRole } from '@prisma/client';

const JWT_SECRET = process.env.JWT_SECRET || '';
function requireSecret() { if (!JWT_SECRET) throw new Error('JWT_SECRET wajib dikonfigurasi'); }
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

export interface TokenPayload {
  userId: string;
  role: UserRole;
}

/**
 * Generates a signed JWT token containing userId and role
 */
export function generateToken(payload: { userId: string; role: string }): string {
  requireSecret();
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  } as jwt.SignOptions);
}

/**
 * Verifies a JWT token and returns payload if valid, null otherwise
 */
export function verifyToken(token: string): { userId: string; role: string; sessionId?: string } | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; role: string; sessionId?: string };
    if (!decoded || typeof decoded !== 'object' || !decoded.userId || !decoded.role) {
      return null;
    }
    return {
      userId: decoded.userId,
      role: decoded.role,
      sessionId: decoded.sessionId,
    };
  } catch {
    return null;
  }
}

/**
 * Hashes a plaintext password using bcrypt with 12 rounds
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

/**
 * Compares plaintext password against a bcrypt hash
 */
export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export const AUTH_CONFIG = {
  JWT_SECRET,
  JWT_EXPIRES_IN,
  COOKIE_NAME: 'token',
};
