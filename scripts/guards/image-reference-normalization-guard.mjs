#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const {
  NORMALIZATION_HELPER_ALLOWLIST,
  findImageReferenceNormalizationViolations,
  inspectImageReferenceNormalization,
  walk,
} = require('./image-reference-normalization-guard-core.cjs')

const root = process.cwd()
const handlersDir = path.join(root, 'src', 'lib', 'workers', 'handlers')

export {
  NORMALIZATION_HELPER_ALLOWLIST,
  findImageReferenceNormalizationViolations,
  inspectImageReferenceNormalization,
}

function fail(title, details = []) {
  process.stderr.write(`\n[image-reference-normalization-guard] ${title}\n`)
  for (const detail of details) {
    process.stderr.write(`  - ${detail}\n`)
  }
  process.exit(1)
}

function main() {
  if (!fs.existsSync(handlersDir)) {
    fail('Missing src/lib/workers/handlers directory')
  }

  const handlerFiles = walk(handlersDir)
  const violations = findImageReferenceNormalizationViolations(root)

  if (violations.length > 0) {
    fail('Found image reference normalization violations', violations)
  }

  process.stdout.write(
    `[image-reference-normalization-guard] OK handlers=${handlerFiles.length} allowlist=${NORMALIZATION_HELPER_ALLOWLIST.size}\n`,
  )
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
