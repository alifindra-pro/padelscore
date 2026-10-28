import { NextResponse } from 'next/server';
import { AUTH_CONFIG } from '@/lib/auth';
import { ApiResponse } from '@/types';

export async function POST() {
  const response = NextResponse.json<ApiResponse<{ message: string }>>({
    data: {
      message: 'Logged out successfully',
    },
  });

  response.cookies.set({
    name: AUTH_CONFIG.COOKIE_NAME,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });

  return response;
}
