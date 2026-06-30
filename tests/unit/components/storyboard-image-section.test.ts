import * as React from 'react'
import { createElement } from 'react'
import type { ComponentProps, ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import type { AbstractIntlMessages } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import ImageSection from '@/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/storyboard/ImageSection'

vi.mock('@/components/media/MediaImageWithLoading', () => ({
  MediaImageWithLoading: (props: { src: string; alt?: string; className?: string }) =>
    createElement('img', { src: props.src, alt: props.alt, className: props.className }),
}))

vi.mock('@/components/task/TaskStatusOverlay', () => ({
  __esModule: true,
  default: () => null,
}))

vi.mock('@/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/storyboard/ImageSectionActionButtons', () => ({
  __esModule: true,
  default: () => null,
}))

vi.mock('@/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/storyboard/ImageSectionCandidateMode', () => ({
  __esModule: true,
  default: () => null,
}))

vi.mock('@/components/ui/icons', () => ({
  AppIcon: (props: { name?: string; className?: string }) =>
    createElement('span', { 'data-icon': props.name, className: props.className }),
}))

const messages = {
  storyboard: {
    image: {
      clickToPreview: '点击预览',
      failed: '生成失败',
    },
    panel: {
      generateImage: '生成图片',
    },
    variant: {
      close: '关闭',
      shotNum: '镜头 {number}',
    },
    video: {
      toolbar: {
        showPending: '待生成',
      },
    },
  },
} as const

function renderWithIntl(node: ReactElement) {
  const providerProps: ComponentProps<typeof NextIntlClientProvider> = {
    locale: 'zh',
    messages: messages as unknown as AbstractIntlMessages,
    timeZone: 'Asia/Shanghai',
    children: node,
  }

  return renderToStaticMarkup(
    createElement(NextIntlClientProvider, providerProps),
  )
}

function createImageSection(props: Partial<ComponentProps<typeof ImageSection>> = {}) {
  return createElement(ImageSection, {
    panelId: 'panel-1',
    imageUrl: 'https://example.com/generated.png',
    globalPanelNumber: 1,
    shotType: '近景',
    videoRatio: '16:9',
    isDeleting: false,
    isModifying: false,
    isSubmittingPanelImageTask: false,
    failedError: null,
    candidateData: null,
    onRegeneratePanelImage: () => undefined,
    onOpenEditModal: () => undefined,
    onOpenAIDataModal: () => undefined,
    onSelectCandidateIndex: () => undefined,
    onConfirmCandidate: async () => undefined,
    onCancelCandidate: () => undefined,
    onClearError: () => undefined,
    ...props,
  })
}

describe('Storyboard ImageSection', () => {
  it('keeps generated image visible when a stale failure error exists', () => {
    Reflect.set(globalThis, 'React', React)

    const html = renderWithIntl(createImageSection({
      imageUrl: 'https://example.com/generated.png',
      failedError: '历史失败提示',
    }))

    expect(html).toContain('https://example.com/generated.png')
    expect(html).not.toContain('生成失败')
    expect(html).not.toContain('历史失败提示')
  })
})
