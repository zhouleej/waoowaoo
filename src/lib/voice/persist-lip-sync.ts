import { prisma } from '@/lib/prisma'

export async function persistLipSync(input: {
  panelId: string
  panelUpdatedAt: Date
  videoUrl: string
  lineId: string
  lineUpdatedAt: Date
  audioUrl: string
  outputUrl: string
}) {
  const changed = () => Object.assign(new Error('LIP_SYNC_SOURCE_CHANGED: 视频或配音已更新，请重新同步口型'), { code: 'CONFLICT', retryable: false })
  await prisma.$transaction(async (tx) => {
    // Lock in the same order used by voice edits and generation.
    await tx.$queryRaw`SELECT id FROM novel_promotion_voice_lines WHERE id = ${input.lineId} FOR UPDATE`
    const line = await tx.novelPromotionVoiceLine.findUnique({ where: { id: input.lineId } })
    if (!line || line.audioUrl !== input.audioUrl || line.updatedAt.getTime() !== input.lineUpdatedAt.getTime()) throw changed()
    const saved = await tx.novelPromotionPanel.updateMany({
      where: { id: input.panelId, updatedAt: input.panelUpdatedAt, videoUrl: input.videoUrl },
      data: { lipSyncVideoUrl: input.outputUrl, lipSyncVideoMediaId: null, lipSyncTaskId: null },
    })
    if (saved.count !== 1) throw changed()
  })
}
