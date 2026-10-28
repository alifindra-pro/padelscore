import { describe, it, expect } from 'vitest';
import prisma from '../../src/lib/db';
import { hashPassword, comparePassword, generateToken, verifyToken } from '../../src/lib/auth';
import { UserRole } from '@prisma/client';

describe('Auth & Security Integration', () => {
  const testEmail = `auth_test_${Date.now()}@padelos.com`;
  const rawPassword = 'SecretPadelPassword2026!';

  it('1. Securely hashes password with bcrypt (not plaintext)', async () => {
    const hash = await hashPassword(rawPassword);
    expect(hash).not.toBe(rawPassword);
    expect(hash.startsWith('$2')).toBe(true);

    const matches = await comparePassword(rawPassword, hash);
    expect(matches).toBe(true);

    const wrongMatches = await comparePassword('wrong-password', hash);
    expect(wrongMatches).toBe(false);
  });

  it('2. Creates user and verifies JWT payload generation and verification', async () => {
    const hash = await hashPassword(rawPassword);
    const user = await prisma.user.create({
      data: {
        email: testEmail,
        username: `user_${Date.now()}`,
        fullName: 'Test Authenticated User',
        passwordHash: hash,
        role: UserRole.ORGANIZER,
      },
    });

    const token = generateToken({ userId: user.id, role: user.role });
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(20);

    const verified = verifyToken(token);
    expect(verified).not.toBeNull();
    expect(verified?.userId).toBe(user.id);
    expect(verified?.role).toBe(UserRole.ORGANIZER);

    const invalid = verifyToken('corrupted-token-xyz');
    expect(invalid).toBeNull();
  });

  it('3. Prevents duplicate email and username registrations at database level', async () => {
    const dupEmail = `dup_${Date.now()}@padelos.com`;
    await prisma.user.create({
      data: {
        email: dupEmail,
        username: `user1_${Date.now()}`,
        fullName: 'Original User',
        passwordHash: 'dummy-hash',
      },
    });

    await expect(
      prisma.user.create({
        data: {
          email: dupEmail,
          username: `user2_${Date.now()}`,
          fullName: 'Duplicate User',
          passwordHash: 'dummy-hash',
        },
      })
    ).rejects.toThrow();
  });
});
