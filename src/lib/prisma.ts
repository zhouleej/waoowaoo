import { revisionClient } from '@/lib/workspace/revisions'
import { PrismaClient } from '@prisma/client'

const globalForPrisma = global as unknown as { prisma: PrismaClient }

const base = globalForPrisma.prisma || new PrismaClient()
export const prisma = revisionClient(base)

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = base

