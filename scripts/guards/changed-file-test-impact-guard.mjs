#!/usr/bin/env node

import process from 'node:process'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const {
  inspectChangedFiles,
  normalizeChangedFiles,
  readGitChangedFiles,
} = require('./changed-file-test-impact-guard-core.cjs')

export {
  inspectChangedFiles,
  normalizeChangedFiles,
  readGitChangedFiles,
}

function fail(violations) {
  console.error('\n[changed-file-test-impact-guard] Missing matching test changes')
  for (const violation of violations) {
    console.error(`  - ${violation}`)
  }
  process.exit(1)
}

function runCli() {
  const inputFiles = process.argv.slice(2)
  const changedFiles = inputFiles.length > 0
    ? normalizeChangedFiles(inputFiles)
    : normalizeChangedFiles([process.env.TEST_IMPACT_CHANGED_FILES || '', ...readGitChangedFiles()])

  if (changedFiles.length === 0) {
    console.log('[changed-file-test-impact-guard] SKIP no changed files detected')
    process.exit(0)
  }

  const violations = inspectChangedFiles(changedFiles)
  if (violations.length > 0) {
    fail(violations)
  }

  console.log(`[changed-file-test-impact-guard] OK files=${changedFiles.length}`)
}

const entryHref = process.argv[1] ? pathToFileURL(process.argv[1]).href : null
if (entryHref && import.meta.url === entryHref) {
  runCli()
}
