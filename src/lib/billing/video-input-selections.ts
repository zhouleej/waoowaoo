type VideoTaskPayload = Record<string, unknown> | null | undefined

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function hasNonEmptyString(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

/**
 * Derives pricing-only video input dimensions from the request that the worker
 * will pass to a video generator. Image inputs (including first/last frames)
 * are deliberately not video inputs.
 */
export function resolveVideoInputPricingSelections(
  payload: VideoTaskPayload,
): { containsVideoInput: boolean } {
  const generationOptions = toRecord(payload?.generationOptions)
  const referenceVideos = generationOptions.referenceVideos

  return {
    containsVideoInput: Array.isArray(referenceVideos)
      && referenceVideos.some(hasNonEmptyString),
  }
}
