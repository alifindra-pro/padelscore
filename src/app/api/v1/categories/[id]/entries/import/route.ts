import { withLegacyAccess } from '@/lib/v2/access';
import { NextRequest, NextResponse } from 'next/server';
import { EntryService } from '@/services/entry.service';
import { requireRole } from '@/middleware/auth.middleware';
import { handleApiError } from '@/lib/errors';
import { UserRole } from '@prisma/client';
import { z } from 'zod';

const importEntriesSchema = z.object({
  items: z.array(
    z.object({
      player1Name: z.string().min(2),
      player1Email: z.string().email().optional(),
      player2Name: z.string().min(2).optional(),
      player2Email: z.string().email().optional(),
      seed: z.number().int().min(1).optional(),
    })
  ).min(1),
});

async function handlePOST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRole(request, [UserRole.SUPER_ADMIN, UserRole.ORGANIZER]);
    const { id } = await params;
    const body = await request.json();
    const { items } = importEntriesSchema.parse(body);

    const imported = await EntryService.importEntries(id, items, user.userId);
    return NextResponse.json({ data: imported });
  } catch (error) {
    return handleApiError(error);
  }
}

export const POST = withLegacyAccess(handlePOST);
