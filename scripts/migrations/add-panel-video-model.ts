import { prisma } from '../../src/lib/prisma'

async function main() {
  const columns = await prisma.$queryRaw<Array<{ COLUMN_NAME: string }>>`
    SELECT COLUMN_NAME FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'novel_promotion_panels' AND COLUMN_NAME = 'videoModel'
  `
  if (!columns.length) {
    await prisma.$executeRawUnsafe('ALTER TABLE novel_promotion_panels ADD COLUMN videoModel VARCHAR(191) NULL')
  }
  process.stdout.write('镜头模型字段已就绪。\n')
}
main().catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
