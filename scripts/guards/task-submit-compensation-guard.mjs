#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const {
  findTaskSubmitCompensationViolations,
  inspectTaskSubmitCompensation,
  walk,
} = require('./task-submit-compensation-guard-core.cjs')

const root = process.cwd()
const apiDir = path.join(root, 'src', 'app', 'api')

export {
  findTaskSubmitCompensationViolations,
  inspectTaskSubmitCompensation,
}

function fail(title, details = []) {
  process.stderr.write(`\n[task-submit-compensation-guard] ${title}\n`)
  for (const detail of details) {
    process.stderr.write(`  - ${detail}\n`)
  }
  process.exit(1)
}

function main() {
  if (!fs.existsSync(apiDir)) {
    fail('Missing src/app/api directory')
  }

  const routeFiles = walk(apiDir)
  const violations = findTaskSubmitCompensationViolations(root)

  if (violations.length > 0) {
    fail('Found create+submitTask routes without compensation marker', violations)
  }

  process.stdout.write(`[task-submit-compensation-guard] OK routes=${routeFiles.length}\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
