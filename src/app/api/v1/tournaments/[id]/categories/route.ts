import { withLegacyAccess } from '@/lib/v2/access';
import { NextRequest, NextResponse } from 'next/server';
import { CategoryService } from '@/services/category.service';
import { createCategorySchema, createRulesetSchema } from '@/lib/validators/tournament';
import { requireRole } from '@/middleware/auth.middleware';
import { handleApiError } from '@/lib/errors';
import { UserRole } from '@prisma/client';

const createCategoryWithRulesetSchema = createCategorySchema.extend({
  ruleset: createRulesetSchema.optional(),
});

async function handleGET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const categories = await CategoryService.listByTournament(id);
    return NextResponse.json({ data: categories });
  } catch (error) {
    return handleApiError(error);
  }
}

async function handlePOST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRole(request, [UserRole.SUPER_ADMIN, UserRole.ORGANIZER]);
    const { id } = await params;
    const body = await request.json();
    const validated = createCategoryWithRulesetSchema.parse(body);

    const category = await CategoryService.createCategory({
      tournamentId: id,
      name: validated.name,
      description: validated.description,
      format: validated.format,
      maxEntries: validated.maxEntries,
      ruleset: validated.ruleset,
      userId: user.userId,
    });

    return NextResponse.json({ data: category }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

export const GET = withLegacyAccess(handleGET);
export const POST = withLegacyAccess(handlePOST);
