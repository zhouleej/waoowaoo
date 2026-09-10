import { ApiError } from '@/lib/api-errors'
import { prisma } from '@/lib/prisma'

export async function requireNovelPromotionProjectInternalId(projectId: string) {
  const project = await prisma.novelPromotionProject.findUnique({
    where: { projectId },
    select: { id: true },
  })

  if (!project) {
    throw new ApiError('NOT_FOUND')
  }

  return project.id
}

export async function requireNovelPromotionEpisodeInProject(projectId: string, episodeId: string) {
  const episode = await prisma.novelPromotionEpisode.findFirst({
    where: {
      id: episodeId,
      novelPromotionProject: { projectId },
    },
    select: {
      id: true,
      novelPromotionProjectId: true,
    },
  })

  if (!episode) {
    throw new ApiError('NOT_FOUND')
  }

  return episode
}

export async function requireNovelPromotionStoryboardInProject(projectId: string, storyboardId: string) {
  const storyboard = await prisma.novelPromotionStoryboard.findFirst({
    where: {
      id: storyboardId,
      episode: {
        novelPromotionProject: { projectId },
      },
    },
    select: {
      id: true,
      episodeId: true,
      clipId: true,
    },
  })

  if (!storyboard) {
    throw new ApiError('NOT_FOUND')
  }

  return storyboard
}

export async function requireNovelPromotionClipInProject(projectId: string, clipId: string) {
  const clip = await prisma.novelPromotionClip.findFirst({
    where: {
      id: clipId,
      episode: {
        novelPromotionProject: { projectId },
      },
    },
    select: {
      id: true,
      episodeId: true,
    },
  })

  if (!clip) {
    throw new ApiError('NOT_FOUND')
  }

  return clip
}

export async function requireNovelPromotionPanelInProject(projectId: string, panelId: string) {
  const panel = await prisma.novelPromotionPanel.findFirst({
    where: {
      id: panelId,
      storyboard: {
        episode: {
          novelPromotionProject: { projectId },
        },
      },
    },
    select: {
      id: true,
      storyboardId: true,
      panelIndex: true,
    },
  })

  if (!panel) {
    throw new ApiError('NOT_FOUND')
  }

  return panel
}

export async function requireNovelPromotionPanelByStoryboardIndexInProject(
  projectId: string,
  storyboardId: string,
  panelIndex: number,
) {
  const panel = await prisma.novelPromotionPanel.findFirst({
    where: {
      storyboardId,
      panelIndex,
      storyboard: {
        episode: {
          novelPromotionProject: { projectId },
        },
      },
    },
      select: {
        id: true,
        storyboardId: true,
        panelIndex: true,
        imageUrl: true,
    },
  })

  if (!panel) {
    throw new ApiError('NOT_FOUND')
  }

  return panel
}

export async function requireNovelPromotionCharacterInProject(projectId: string, characterId: string) {
  const character = await prisma.novelPromotionCharacter.findFirst({
    where: {
      id: characterId,
      novelPromotionProject: { projectId },
    },
    select: { id: true },
  })

  if (!character) {
    throw new ApiError('NOT_FOUND')
  }

  return character
}

export async function requireNovelPromotionLocationInProject(projectId: string, locationId: string) {
  const location = await prisma.novelPromotionLocation.findFirst({
    where: {
      id: locationId,
      novelPromotionProject: { projectId },
    },
    select: { id: true },
  })

  if (!location) {
    throw new ApiError('NOT_FOUND')
  }

  return location
}

export async function requireNovelPromotionLocationImageInProject(
  projectId: string,
  locationId: string,
  imageIndex: number,
) {
  const image = await prisma.locationImage.findFirst({
    where: {
      locationId,
      imageIndex,
      location: {
        novelPromotionProject: { projectId },
      },
    },
    select: { id: true },
  })

  if (!image) {
    throw new ApiError('NOT_FOUND')
  }

  return image
}

export async function requireNovelPromotionCharacterAppearanceInProject(projectId: string, appearanceId: string) {
  const appearance = await prisma.characterAppearance.findFirst({
    where: {
      id: appearanceId,
      character: {
        novelPromotionProject: { projectId },
      },
    },
    select: {
      id: true,
      characterId: true,
    },
  })

  if (!appearance) {
    throw new ApiError('NOT_FOUND')
  }

  return appearance
}

export async function requireNovelPromotionVoiceLineInProject(projectId: string, lineId: string) {
  const voiceLine = await prisma.novelPromotionVoiceLine.findFirst({
    where: {
      id: lineId,
      episode: {
        novelPromotionProject: { projectId },
      },
    },
    select: {
      id: true,
      episodeId: true,
    },
  })

  if (!voiceLine) {
    throw new ApiError('NOT_FOUND')
  }

  return voiceLine
}

export async function requireNovelPromotionShotInProject(projectId: string, shotId: string) {
  const shot = await prisma.novelPromotionShot.findFirst({
    where: {
      id: shotId,
      episode: {
        novelPromotionProject: { projectId },
      },
    },
    select: {
      id: true,
      episodeId: true,
    },
  })

  if (!shot) {
    throw new ApiError('NOT_FOUND')
  }

  return shot
}
