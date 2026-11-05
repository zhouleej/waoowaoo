import { prisma } from '@/lib/prisma'
import { WorkspaceError as ApiError } from './errors'
import { requireWorkspaceManager } from './access'
import { workspaceRuntime } from './runtime'

export async function requireAssetDeletion(kind: string, id: string) {
  if (!workspaceRuntime().organizationId) return
  await requireWorkspaceManager()
  if (kind === 'voice') {
    const assets = await prisma.globalCharacter.findMany({ where: { globalVoiceId: id }, select: { id: true, name: true } })
    if (assets.length) throw new ApiError('CONFLICT', { message: '音色仍被角色引用 / Voice is referenced by characters', assets })
  }
  if (kind === 'style') {
    const value = `custom:${id}`
    const [projects, appearances, locations] = await Promise.all([
      prisma.novelPromotionProject.findMany({ where: { artStyle: value }, select: { project: { select: { id: true, name: true } } } }),
      prisma.globalCharacterAppearance.findMany({ where: { artStyle: value }, select: { character: { select: { id: true, name: true } } } }),
      prisma.globalLocation.findMany({ where: { artStyle: value }, select: { id: true, name: true } }),
    ])
    if (projects.length || appearances.length || locations.length) throw new ApiError('CONFLICT', { message: '画风仍被项目或资产引用 / Style is still in use', projects: projects.map(item => item.project), assets: [...appearances.map(item => item.character), ...locations] })
  }
  const references = kind === 'character'
    ? await prisma.novelPromotionCharacter.findMany({ where: { sourceGlobalCharacterId: id }, select: { novelPromotionProject: { select: { project: { select: { id: true, name: true } } } } } })
    : kind === 'location' ? await prisma.novelPromotionLocation.findMany({ where: { sourceGlobalLocationId: id }, select: { novelPromotionProject: { select: { project: { select: { id: true, name: true } } } } } }) : []
  if (references.length) throw new ApiError('CONFLICT', { message: '资产仍被项目引用 / Asset is referenced by projects', projects: references.map(item => item.novelPromotionProject.project) })
}
