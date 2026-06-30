import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withPrismaRetry } from '@/lib/prisma-retry'
import { requirePlatformAdmin } from '@/lib/platform-admin'
import { apiHandler } from '@/lib/api-errors'

/**
 * GET /api/platform/organizations/[id]/members
 * 平台管理员查看任意组织成员列表
 */
export const GET = apiHandler(async (_req, ctx) => {
  const params = await ctx.params
  const organizationId = params.id as string

  const authResult = await requirePlatformAdmin()
  if (authResult instanceof NextResponse) return authResult

  const members = await withPrismaRetry(() =>
    prisma.organizationMember.findMany({
      where: { organizationId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
      },
      orderBy: [
        { role: 'asc' },
        { joinedAt: 'asc' },
      ],
    })
  )

  return NextResponse.json(members)
})
