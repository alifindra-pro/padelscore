import { withLegacyAccess } from '@/lib/v2/access';
import { NextRequest, NextResponse } from 'next/server';
import { BracketService } from '@/services/bracket.service';
import { requireRole } from '@/middleware/auth.middleware';
import { handleApiError } from '@/lib/errors';
import { UserRole } from '@prisma/client';

async function handlePOST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRole(request, [UserRole.SUPER_ADMIN, UserRole.ORGANIZER]);
    const { id } = await params;

    const result = await BracketService.generateCategoryBracket(id, user.userId);
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

export const POST = withLegacyAccess(handlePOST);
