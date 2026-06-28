/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs')
const path = require('node:path')

const NORMALIZATION_HELPER_ALLOWLIST = new Set([
  'src/lib/workers/handlers/image-task-handler-shared.ts',
])

const ACCEPTED_NORMALIZATION_MARKERS = [
  /\bnormalizeReferenceImagesForGeneration\s*\(/,
  /\bnormalizeToBase64ForGeneration\s*\(/,
  /\bgenerateProjectLabeledImageToStorage\s*\(/,
  /\bgenerateCleanImageToStorage\s*\(/,
]

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name === '.git' || entry.name === '.next' || entry.name === 'node_modules') continue
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(fullPath, out)
      continue
    }
    if (entry.name.endsWith('.ts')) out.push(fullPath)
  }
  return out
}

function usesGenerationReferenceImages(content) {
  return /\bresolveImageSourceFromGeneration\s*\(/.test(content) && /\breferenceImages\s*:/.test(content)
}

function hasNormalizationMarker(content) {
  return ACCEPTED_NORMALIZATION_MARKERS.some((pattern) => pattern.test(content))
}

function inspectImageReferenceNormalization(relPath, content) {
  if (NORMALIZATION_HELPER_ALLOWLIST.has(relPath)) return []
  if (!usesGenerationReferenceImages(content)) return []
  if (hasNormalizationMarker(content)) return []
  return [
    `${relPath} uses resolveImageSourceFromGeneration with referenceImages but does not reference normalizeReferenceImagesForGeneration/normalizeToBase64ForGeneration/generateProjectLabeledImageToStorage/generateCleanImageToStorage`,
  ]
}

function findImageReferenceNormalizationViolations(scanRoot = process.cwd()) {
  const scanDir = path.join(scanRoot, 'src', 'lib', 'workers', 'handlers')
  return walk(scanDir)
    .map((fullPath) => {
      const relPath = path.relative(scanRoot, fullPath).split(path.sep).join('/')
      const content = fs.readFileSync(fullPath, 'utf8')
      return inspectImageReferenceNormalization(relPath, content)
    })
    .flat()
}

module.exports = {
  NORMALIZATION_HELPER_ALLOWLIST,
  findImageReferenceNormalizationViolations,
  inspectImageReferenceNormalization,
  walk,
}
