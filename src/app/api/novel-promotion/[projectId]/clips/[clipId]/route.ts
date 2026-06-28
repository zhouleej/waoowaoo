import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler } from '@/lib/api-errors'
import { requireNovelPromotionClipInProject } from '@/lib/saas/novel-promotion-resource-access'

/**
 * PATCH /api/novel-promotion/[projectId]/clips/[clipId]
 * 更新单个 Clip 的信息
 * 支持更新：characters, location, props, content, screenplay
 */
export const PATCH = apiHandler(async (
    request: NextRequest,
    context: { params: Promise<{ projectId: string; clipId: string }> }
) => {
    const { projectId, clipId } = await context.params

    // 🔐 统一权限验证
    const authResult = await requireProjectAuthLight(projectId)
    if (isErrorResponse(authResult)) return authResult

    const body = await request.json()
    const { characters, location, props, content, screenplay } = body
    const clipModel = prisma.novelPromotionClip as unknown as {
        update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown>
    }

    await requireNovelPromotionClipInProject(projectId, clipId)

    const updateData: {
        characters?: string | null
        location?: string | null
        props?: string | null
        content?: string
        screenplay?: string | null
    } = {}
    if (characters !== undefined) updateData.characters = characters // JSON string
    if (location !== undefined) updateData.location = location
    if (props !== undefined) updateData.props = props
    if (content !== undefined) updateData.content = content
    if (screenplay !== undefined) updateData.screenplay = screenplay // JSON string

    const clip = await clipModel.update({
        where: { id: clipId },
        data: updateData
    })

    return NextResponse.json({ success: true, clip })
})
