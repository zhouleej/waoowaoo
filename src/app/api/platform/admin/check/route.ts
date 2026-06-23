import { NextResponse } from 'next/server'
import { checkPlatformAdmin } from '@/lib/platform-admin'
import { apiHandler } from '@/lib/api-errors'

/**
 * GET /api/platform/admin/check
 * 验证当前用户是否为管理员
 * 返回: { isAdmin: boolean, user: { id, name, email } }
 */
export const GET = apiHandler(async () => {
  const result = await checkPlatformAdmin()

  // checkPlatformAdmin 可能返回 NextResponse 或对象
  if (result instanceof NextResponse) {
    return result
  }

  return NextResponse.json({
    isAdmin: result.isAdmin,
    user: result.user,
  })
})