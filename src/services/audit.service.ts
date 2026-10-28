import prisma from '@/lib/db';
import { Prisma } from '@prisma/client';

export interface CreateAuditLogParams {
  userId?: string | null;
  tournamentId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  ipAddress?: string | null;
}

export async function createAuditLog(
  params: CreateAuditLogParams,
  tx?: Prisma.TransactionClient
) {
  const client = tx || prisma;
  try {
    return await client.auditLog.create({
      data: {
        userId: params.userId || null,
        tournamentId: params.tournamentId || null,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId || '',
        before: params.before ? (params.before as Prisma.InputJsonValue) : Prisma.JsonNull,
        after: params.after ? (params.after as Prisma.InputJsonValue) : Prisma.JsonNull,
        ipAddress: params.ipAddress || null,
      },
    });
  } catch (error) {
    console.error('Failed to write audit log:', error);
    // Audit log failure shouldn't fail the primary user operation unless required
    return null;
  }
}
