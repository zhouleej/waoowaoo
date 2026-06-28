#!/usr/bin/env node

import process from 'process'
import { createRequire } from 'module'
import { pathToFileURL } from 'url'

const require = createRequire(import.meta.url)
const core = require('./api-route-contract-guard-core.cjs')

export const API_HANDLER_ALLOWLIST = core.API_HANDLER_ALLOWLIST
export const PUBLIC_ROUTE_ALLOWLIST = core.PUBLIC_ROUTE_ALLOWLIST
export const inspectRouteContract = core.inspectRouteContract
export const findApiRouteContractViolations = core.findApiRouteContractViolations
export const main = core.main

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
