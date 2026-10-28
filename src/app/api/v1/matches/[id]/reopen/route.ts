import { withLegacyAccess } from '@/lib/v2/access';
import { NextRequest, NextResponse } from 'next/server';
import { MatchService } from '@/services/match.service';
import { requireRole } from '@/middleware/auth.middleware';
import { handleApiError } from '@/lib/errors';
import { UserRole } from '@prisma/client';
import { z } from 'zod';

const reopenSchema = z.object({
  reason: z.string().min(5, 'Reason must be at least 5 characters'),
});

async function handlePOST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRole(request, [
      UserRole.SUPER_ADMIN,
      UserRole.ORGANIZER,
    ]);
    const { id } = await params;
    const body = await request.json();
    const { reason } = reopenSchema.parse(body);

    const result = await MatchService.reopenMatch(id, user.userId, reason);
    return NextResponse.json({ data: result });
  } catch (error) {
    return handleApiError(error);
  }
}

export const POST = withLegacyAccess(handlePOST);
