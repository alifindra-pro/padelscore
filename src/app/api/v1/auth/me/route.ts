import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/middleware/auth.middleware';
import { notFound, handleApiError } from '@/lib/errors';
import { ApiResponse, UserResponse } from '@/types';


export async function GET(request: NextRequest) {
  try {
    const authUser = await requireAuth(request);

    const user = await prisma.user.findUnique({
      where: {
        id: authUser.userId,
      },
    });

    if (!user || !user.isActive) {
      throw notFound('User not found or inactive');
    }

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

    return NextResponse.json<ApiResponse<{ user: UserResponse }>>({
      data: {
        user: userResponse,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
