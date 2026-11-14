import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { comparePassword, generateToken, AUTH_CONFIG } from '@/lib/auth';
import { loginSchema } from '@/lib/validators/auth';
import { unauthorized, handleApiError } from '@/lib/errors';
import { ApiResponse, UserResponse } from '@/types';
import { assertLoginAllowed, loginKeys, recordLoginFailure } from '@/lib/login-throttle';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = loginSchema.parse(body);
    const throttle = loginKeys(request, validatedData.identifier);
    await assertLoginAllowed(throttle);

    const user = await prisma.user.findUnique({
      where: validatedData.identifier.includes('@')
        ? { email: validatedData.identifier.toLowerCase() }
        : { username: validatedData.identifier },
    });

    if (!user || !user.isActive) {
      await recordLoginFailure(throttle);
      throw unauthorized('Nama pengguna, email, atau kata sandi tidak sesuai');
    }

    const isPasswordValid = await comparePassword(validatedData.password, user.passwordHash);
    if (!isPasswordValid) {
      await recordLoginFailure(throttle);
      throw unauthorized('Nama pengguna, email, atau kata sandi tidak sesuai');
    }

    const token = generateToken({
      userId: user.id,
      role: user.role,
    });

    const userResponse: UserResponse = {
      id: user.id,
      email: user.email,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };

    const response = NextResponse.json<ApiResponse<{ user: UserResponse }>>({
      data: {
        user: userResponse,
      },
    });

    response.cookies.set({
      name: AUTH_CONFIG.COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
    });

    return response;
  } catch (error) {
    return handleApiError(error);
  }
}
