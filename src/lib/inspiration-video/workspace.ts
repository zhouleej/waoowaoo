import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { resolveCurrentOrganization } from '@/lib/saas/current-organization'

const INTERNAL_PROJECT_NAME = '灵感视频'
const INTERNAL_PROJECT_DESCRIPTION = '灵感视频创作记录（系统内部工作区）'

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}

export async function resolveInspirationVideoWorkspace(userId: string) {
  const preference = await prisma.userPreference.findUnique({
    where: { userId },
    select: { currentOrganizationId: true },
  })
  const organizationContext = await resolveCurrentOrganization(
    userId,
    null,
    preference?.currentOrganizationId,
  )
  if ('error' in organizationContext) return organizationContext

  const organizationId = organizationContext.organizationId
  const isSharedOrganizationWorkspace = organizationId
    && (organizationContext.membership?.role === 'owner' || organizationContext.membership?.role === 'admin')
  const scopeKey = isSharedOrganizationWorkspace
    ? `organization:${organizationId}`
    : organizationId
      ? `organization:${organizationId}:user:${userId}`
      : `user:${userId}`
  const existing = await prisma.inspirationVideoWorkspace.findUnique({
    where: { scopeKey },
  })
  if (existing) return { workspace: existing, organizationId }

  try {
    const workspace = await prisma.$transaction(async (tx) => {
      const project = await tx.project.create({
        data: {
          name: INTERNAL_PROJECT_NAME,
          description: INTERNAL_PROJECT_DESCRIPTION,
          userId,
          organizationId,
        },
      })
      return await tx.inspirationVideoWorkspace.create({
        data: {
          scopeKey,
          projectId: project.id,
        },
      })
    })
    return { workspace, organizationId }
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error
    const workspace = await prisma.inspirationVideoWorkspace.findUnique({
      where: { scopeKey },
    })
    if (!workspace) throw error
    return { workspace, organizationId }
  }
}
