import { withLegacyAccess } from '@/lib/v2/access';
import { NextRequest, NextResponse } from 'next/server';
import { MatchService } from '@/services/match.service';
import { requireRole } from '@/middleware/auth.middleware';
import { handleApiError } from '@/lib/errors';
import { UserRole } from '@prisma/client';
import { z } from 'zod';

const undoSchema = z.object({
  clientVersion: z.number().int().min(0),
  idempotencyKey: z.string().optional(),
  reason: z.string().optional(),
});

async function handlePOST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRole(request, [
      UserRole.SUPER_ADMIN,
      UserRole.ORGANIZER,
      UserRole.REFEREE,
    ]);
    const { id } = await params;
    const body = await request.json();
    const validated = undoSchema.parse(body);

    const result = await MatchService.undoPoint({
      matchId: id,
      clientVersion: validated.clientVersion,
      idempotencyKey: validated.idempotencyKey,
      reason: validated.reason,
      userId: user.userId,
    });

    return NextResponse.json({ data: result });
  } catch (error) {
    return handleApiError(error);
  }
}

export const POST = withLegacyAccess(handlePOST);
