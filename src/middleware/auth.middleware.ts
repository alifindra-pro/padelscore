import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { UserRole } from '@prisma/client';
import { verifyToken, AUTH_CONFIG } from '@/lib/auth';
import { unauthorized, forbidden } from '@/lib/errors';

export interface AuthUser {
  userId: string;
  role: UserRole;
}

/**
 * Extracts and verifies JWT from cookies or Authorization Bearer header.
 * Returns AuthUser if valid, null otherwise.
 */
export async function getAuthUser(request: NextRequest): Promise<AuthUser | null> {
  let token = request.cookies.get(AUTH_CONFIG.COOKIE_NAME)?.value;

  if (!token) {
    const authHeader = request.headers.get('authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim();
    }
  }

  if (!token) {
    return null;
  }

  const payload = verifyToken(token);
  if (!payload) {
    return null;
  }

  if (payload.sessionId) { const session = await prisma.mobileSession.findUnique({ where: { id: payload.sessionId } }); if (!session || session.revokedAt || session.expiresAt < new Date() || session.userId !== payload.userId) return null; }
  const account = await prisma.user.findUnique({ where: { id: payload.userId } });
  if (!account?.isActive) return null;
  return { userId: account.id, role: account.role };
}

/**
 * Ensures request has a valid authenticated user.
 * Throws AppError(401) if not authenticated.
 */
export async function requireAuth(request: NextRequest): Promise<AuthUser> {
  const user = await getAuthUser(request);
  if (!user) {
    throw unauthorized('Authentication required. Please log in.');
  }
  return user;
}

/**
 * Ensures authenticated user has one of the required roles.
 * Throws AppError(401) if unauthenticated, or AppError(403) if unauthorized role.
 */
export async function requireRole(request: NextRequest, roles: UserRole[]): Promise<AuthUser> {
  const user = await requireAuth(request);
  if (!roles.includes(user.role)) {
    throw forbidden(`Access forbidden. Required role: ${roles.join(', ')}`);
  }
  return user;
}
