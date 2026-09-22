import { NextRequest, NextResponse } from 'next/server'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { ApiError, apiHandler } from '@/lib/api-errors'
import { prisma } from '@/lib/prisma'
import { customArtStyleValue, parseCustomStyleInput } from '@/lib/art-styles/custom'

type Context = { params: Promise<{ styleId: string }> }

export const PATCH = apiHandler(async (request: NextRequest, context: Context) => {
  const auth = await requireUserAuth()
  if (isErrorResponse(auth)) return auth
  const { styleId } = await context.params
  const { name, prompt } = parseCustomStyleInput(await request.json())
  const result = await prisma.customArtStyle.updateMany({
    where: { id: styleId, userId: auth.session.user.id }, data: { name, prompt },
  })
  if (result.count !== 1) throw new ApiError('NOT_FOUND')
  const style = await prisma.customArtStyle.findFirstOrThrow({ where: { id: styleId, userId: auth.session.user.id } })
  return NextResponse.json({ style: { ...style, value: customArtStyleValue(style.id) } })
})

export const DELETE = apiHandler(async (_request: NextRequest, context: Context) => {
  const auth = await requireUserAuth()
  if (isErrorResponse(auth)) return auth
  const { styleId } = await context.params
  const result = await prisma.customArtStyle.deleteMany({ where: { id: styleId, userId: auth.session.user.id } })
  if (result.count !== 1) throw new ApiError('NOT_FOUND')
  return NextResponse.json({ success: true })
})
