import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { attachMediaFieldsToProject } from '@/lib/media/attach'

function readAssetKind(value: Record<string, unknown>): string {
    return typeof value.assetKind === 'string' ? value.assetKind : 'location'
}

/**
 * ⚡ 延迟加载 API - 获取项目的 characters 和 locations 资产
 * 用于资产管理页面，避免首次加载时的性能开销
 */
export const GET = apiHandler(async (
    request: NextRequest,
    context: { params: Promise<{ projectId: string }> }
) => {
    const { projectId } = await context.params

    // 🔐 统一权限验证
    const authResult = await requireProjectAuthLight(projectId)
    if (isErrorResponse(authResult)) return authResult

    // 获取 characters 和 locations（包含嵌套数据）
    const novelPromotionData = await prisma.novelPromotionProject.findUnique({
        where: { projectId },
        include: {
            characters: {
                include: { appearances: { orderBy: { appearanceIndex: 'asc' } } },
                orderBy: { createdAt: 'asc' }
            },
            locations: {
                include: { images: { orderBy: { imageIndex: 'asc' } } },
                orderBy: { createdAt: 'asc' }
            }
        }
    })

    if (!novelPromotionData) {
        throw new ApiError('NOT_FOUND')
    }

    // 转换为稳定媒体 URL（并保留兼容字段）
    const dataWithSignedUrls = await attachMediaFieldsToProject(novelPromotionData)

    const locations = (dataWithSignedUrls.locations || []).filter((item) => readAssetKind(item) !== 'prop')
    const props = (dataWithSignedUrls.locations || []).filter((item) => readAssetKind(item) === 'prop')

    return NextResponse.json({
        characters: dataWithSignedUrls.characters || [],
        locations,
        props,
    })
})
