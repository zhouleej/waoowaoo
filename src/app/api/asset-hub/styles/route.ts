import { NextRequest, NextResponse } from 'next/server'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler } from '@/lib/api-errors'
import { prisma } from '@/lib/prisma'
import { customArtStyleValue, parseCustomStyleInput } from '@/lib/art-styles/custom'

export const GET = apiHandler(async () => {
  const auth = await requireUserAuth()
  if (isErrorResponse(auth)) return auth
  const styles = await prisma.customArtStyle.findMany({
    where: { userId: auth.session.user.id }, orderBy: { updatedAt: 'desc' },
  })
  return NextResponse.json({ styles: styles.map((style) => ({ ...style, value: customArtStyleValue(style.id) })) })
})

export const POST = apiHandler(async (request: NextRequest) => {
  const auth = await requireUserAuth()
  if (isErrorResponse(auth)) return auth
  const { name, prompt } = parseCustomStyleInput(await request.json())
  const style = await prisma.customArtStyle.create({ data: { userId: auth.session.user.id, name, prompt } })
  return NextResponse.json({ style: { ...style, value: customArtStyleValue(style.id) } }, { status: 201 })
})
