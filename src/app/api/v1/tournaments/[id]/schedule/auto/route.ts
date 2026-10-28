import { withLegacyAccess } from '@/lib/v2/access';
import { NextRequest, NextResponse } from 'next/server';
import { SchedulingService } from '@/services/scheduling.service';
import { requireRole } from '@/middleware/auth.middleware';
import { handleApiError } from '@/lib/errors';
import { UserRole } from '@prisma/client';
import { z } from 'zod';

const autoScheduleSchema = z.object({
  startTime: z.string().datetime(),
  matchDurationMinutes: z.number().int().min(15).max(180).default(60),
  minRestMinutes: z.number().int().min(0).max(180).default(30),
});

async function handlePOST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRole(request, [UserRole.SUPER_ADMIN, UserRole.ORGANIZER]);
    const { id } = await params;
    const body = await request.json();
    const validated = autoScheduleSchema.parse(body);

    const result = await SchedulingService.autoScheduleTournament({
      tournamentId: id,
      startTime: validated.startTime,
      matchDurationMinutes: validated.matchDurationMinutes,
      minRestMinutes: validated.minRestMinutes,
      userId: user.userId,
    });

    return NextResponse.json({ data: result });
  } catch (error) {
    return handleApiError(error);
  }
}

export const POST = withLegacyAccess(handlePOST);
