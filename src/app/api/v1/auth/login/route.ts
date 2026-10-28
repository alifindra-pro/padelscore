import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { comparePassword, generateToken, AUTH_CONFIG } from '@/lib/auth';
import { loginSchema } from '@/lib/validators/auth';
import { unauthorized, handleApiError } from '@/lib/errors';
import { ApiResponse, UserResponse } from '@/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = loginSchema.parse(body);

    const user = await prisma.user.findUnique({
      where: {
        email: validatedData.email.toLowerCase(),
      },
    });

    if (!user || !user.isActive) {
      throw unauthorized('Email atau kata sandi tidak sesuai');
    }

    const isPasswordValid = await comparePassword(validatedData.password, user.passwordHash);
    if (!isPasswordValid) {
      throw unauthorized('Email atau kata sandi tidak sesuai');
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
