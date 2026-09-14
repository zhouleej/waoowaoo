import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  navigateWithDocumentReload,
  type DocumentNavigationClick,
} from '@/lib/navigation/document-navigation'

function createClick(overrides: Partial<DocumentNavigationClick> = {}): DocumentNavigationClick {
  return {
    button: 0,
    defaultPrevented: false,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    currentTarget: { href: 'https://example.com/zh/workspace' },
    preventDefault: vi.fn(),
    ...overrides,
  }
}

describe('document navigation', () => {
  const assignMock = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('window', { location: { assign: assignMock } })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loads the workspace in a fresh document for a normal click', () => {
    const event = createClick()

    navigateWithDocumentReload(event)

    expect(event.preventDefault).toHaveBeenCalledTimes(1)
    expect(assignMock).toHaveBeenCalledWith('https://example.com/zh/workspace')
  })

  it('preserves modifier-click behavior', () => {
    const event = createClick({ ctrlKey: true })

    navigateWithDocumentReload(event)

    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(assignMock).not.toHaveBeenCalled()
  })
})
