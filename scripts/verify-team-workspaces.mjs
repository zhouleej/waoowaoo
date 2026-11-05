/** Local acceptance test. Creates isolated, temporary fixtures; never calls a paid AI service. */
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import sharp from 'sharp'
import prismaModule from '../src/lib/prisma.ts'
const { prisma } = prismaModule
import runtimeModule from '../src/lib/workspace/runtime.ts'
const { withWorkspaceRuntime } = runtimeModule
import budgetModule from '../src/lib/workspace/budget.ts'
const { reserveTeamBudget, releaseTeamReservation, memberBudget, withTeamUsage } = budgetModule
import configModule from '../src/lib/api-config.ts'
const { getProviderConfig } = configModule

const base = process.env.TEAM_VERIFY_URL ?? 'http://localhost:3000'
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Only local applications can be verified')
const prefix = `team-verify-${Date.now()}`
const password = randomUUID(), users = [], teamIds = [], mediaIds = []
let checks = 0
function passed(label) { checks++; console.log(`PASS ${label}`) }
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

class BrowserSession {
  cookies = new Map()
  revisions = {}
  async request(path, method = 'GET', body, scope = 'personal', expected = this.revisions) {
    const headers = { 'X-Workspace-Scope': scope, 'Accept-Language': 'zh', Cookie: [...this.cookies].map(([key, value]) => `${key}=${value}`).join('; ') }
    if (method !== 'GET') headers['X-Resource-Revisions'] = JSON.stringify(expected)
    if (body !== undefined && !(body instanceof FormData)) headers['Content-Type'] = 'application/json'
    const response = await fetch(base + path, { method, headers, redirect: 'manual', body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body) })
    this.capture(response)
    const text = await response.text()
    let data = null
    try { data = JSON.parse(text) } catch { /* Media responses are binary. */ }
    return { status: response.status, data }
  }
  capture(response) {
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(';')[0], index = pair.indexOf('=')
      this.cookies.set(pair.slice(0, index), pair.slice(index + 1))
    }
    const revisions = response.headers.get('X-Resource-Revisions')
    if (revisions) Object.assign(this.revisions, JSON.parse(revisions))
  }
  async login(user, retry = 0) {
    const csrf = await this.request('/api/auth/csrf')
    const response = await fetch(base + '/api/auth/callback/credentials', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: [...this.cookies].map(([key, value]) => `${key}=${value}`).join('; ') }, body: new URLSearchParams({ csrfToken: csrf.data.csrfToken, username: user.name, password, json: 'true' }), redirect: 'manual' })
    this.capture(response)
    if (response.status === 429 && retry < 2) {
      await wait((Number(response.headers.get('retry-after')) || 60) * 1000 + 100)
      return this.login(user, retry + 1)
    }
    const session = await this.request('/api/auth/session')
    assert.equal(session.data.user?.id, user.id, 'Test account login')
  }
  async ok(path, method = 'GET', body, scope = 'personal') {
    const response = await this.request(path, method, body, scope)
    assert.ok(response.status >= 200 && response.status < 300, `${method} ${path}: ${response.status} ${JSON.stringify(response.data)}`)
    return response.data
  }
}

const observedCredentials = []
const fake = createServer(async (req, res) => {
  observedCredentials.push(req.headers.authorization)
  let raw = ''
  for await (const piece of req) raw += piece
  const body = raw ? JSON.parse(raw) : {}
  res.setHeader('Content-Type', 'application/json')
  if (req.url?.endsWith('/models')) { res.end(JSON.stringify({ data: [{ id: 'team-test-model', object: 'model' }] })); return }
  res.end(JSON.stringify({ id: `chatcmpl-${randomUUID()}`, object: 'chat.completion', created: Math.floor(Date.now() / 1000), model: body.model ?? 'team-test-model', choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify({ prompt: 'A consistent test character in a studio.' }) }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } }))
})
await new Promise((resolve, reject) => { fake.once('error', reject); fake.listen(18080, '127.0.0.1', resolve) })

try {
  for (const role of ['owner', 'admin', 'member', 'outsider']) users.push(await prisma.user.create({ data: { name: `${prefix}-${role}`, password: await bcrypt.hash(password, 10) } }))
  const [owner, admin, member, outsider] = users
  const [o, a, m, x] = [new BrowserSession(), new BrowserSession(), new BrowserSession(), new BrowserSession()]
  await Promise.all([o.login(owner), a.login(admin), m.login(member), x.login(outsider)])
  const team = await o.ok('/api/organizations', 'POST', { name: prefix, billingSource: 'team_api_key' })
  teamIds.push(team.id)
  const scope = `team:${team.id}`
  assert.equal(team.billingSource, 'team_api_key')
  passed('Team creation automatically assigns the owner')
  const invitation = (await o.ok(`/api/organizations/${team.id}/invitations`, 'POST', { account: member.name })).data
  assert.equal(await prisma.organizationMember.count({ where: { organizationId: team.id } }), 1)
  assert.equal((await m.request(`/api/organizations/${team.id}`)).status, 403)
  assert.equal((await x.request(`/api/user/team-invitations/${invitation.id}`, 'POST', { action: 'accept' })).status, 404)
  passed('An invitation does not grant access and cannot be accepted by another account')
  await Promise.all([m.ok(`/api/user/team-invitations/${invitation.id}`, 'POST', { action: 'accept' }), m.ok(`/api/user/team-invitations/${invitation.id}`, 'POST', { action: 'accept' })])
  assert.equal(await prisma.organizationMember.count({ where: { organizationId: team.id, userId: member.id } }), 1)
  passed('Concurrent invitation acceptance is idempotent')
  const adminInvitation = (await o.ok(`/api/organizations/${team.id}/invitations`, 'POST', { account: admin.name, role: 'admin' })).data
  await a.ok(`/api/user/team-invitations/${adminInvitation.id}`, 'POST', { action: 'accept' })
  assert.equal((await a.request(`/api/organizations/${team.id}/members/${member.id}`, 'PATCH', { role: 'admin' })).status, 403)
  assert.equal((await o.request(`/api/organizations/${team.id}/members`, 'POST', { account: outsider.name })).status, 400)
  passed('Administrators cannot promote members and direct membership creation is disabled')

  const personal = await o.ok('/api/asset-hub/characters', 'POST', { name: 'Private test hero', description: 'A private character', artStyle: 'american-comic' })
  const shared = await o.ok('/api/asset-hub/characters', 'POST', { name: 'Shared test hero', description: 'A shared character', artStyle: 'american-comic' }, scope)
  const personalId = personal.character.id, sharedId = shared.character.id
  const memberAssets = await m.ok('/api/asset-hub/characters', 'GET', undefined, scope)
  assert.ok(memberAssets.characters.some(asset => asset.id === sharedId))
  assert.ok(!memberAssets.characters.some(asset => asset.id === personalId))
  const privateAssets = await o.ok('/api/asset-hub/characters')
  assert.ok(!privateAssets.characters.some(asset => asset.id === sharedId))
  const another = await x.ok('/api/organizations', 'POST', { name: `${prefix}-other` })
  teamIds.push(another.id)
  assert.equal((await m.request('/api/asset-hub/characters', 'GET', undefined, `team:${another.id}`)).status, 403)
  passed('Shared assets are visible to teammates and isolated from personal and other teams')

  await o.ok('/api/asset-hub/characters', 'GET', undefined, scope)
  const stale = { ...m.revisions }
  await o.ok(`/api/asset-hub/characters/${sharedId}`, 'PATCH', { name: 'Updated shared hero' }, scope)
  const conflict = await m.request(`/api/asset-hub/characters/${sharedId}`, 'PATCH', { name: 'Stale overwrite' }, scope, stale)
  assert.equal(conflict.status, 409)
  assert.equal((await prisma.globalCharacter.findUniqueOrThrow({ where: { id: sharedId } })).name, 'Updated shared hero')
  passed('A stale edit returns 409 without overwriting another member’s content')
  const copied = await o.ok('/api/asset-hub/copy-to-team', 'POST', { organizationId: team.id, assets: [{ id: personalId, kind: 'character' }] })
  const copiedAsset = await prisma.globalCharacter.findUniqueOrThrow({ where: { id: copied.assets[0].id }, include: { appearances: true } })
  assert.equal(copiedAsset.organizationId, team.id)
  assert.notEqual(copiedAsset.id, personalId)
  assert.ok(copiedAsset.appearances.length > 0)
  passed('Copying a personal asset creates an independent team asset')

  const providerId = 'openai-compatible:team-test', modelKey = `${providerId}::team-test-model`
  const configInput = { version: 0, providers: [{ id: providerId, name: 'Local verification provider', baseUrl: 'http://127.0.0.1:18080/v1', apiKey: 'local-test-key-one', gatewayRoute: 'openai-compat' }], models: [{ provider: providerId, modelId: 'team-test-model', name: 'Local test model', type: 'llm', budgetPrice: 1, llmProtocol: 'chat-completions' }], defaults: { analysisModel: modelKey } }
  const config = await o.ok(`/api/organizations/${team.id}/model-config`, 'PUT', configInput)
  assert.ok(!JSON.stringify(config).includes('local-test-key-one'))
  const savedTeam = await prisma.organization.findUniqueOrThrow({ where: { id: team.id } })
  const firstVersionId = savedTeam.currentModelConfigId
  const memberModels = await m.ok('/api/user/models', 'GET', undefined, scope)
  assert.ok(memberModels.llm.some(model => model.value === modelKey))
  assert.equal((await prisma.userPreference.findUnique({ where: { userId: member.id } }))?.customProviders ?? null, null)
  assert.equal((await m.request(`/api/organizations/${team.id}/model-config`, 'PUT', configInput)).status, 403)
  assert.equal((await o.request(`/api/organizations/${team.id}/model-config`, 'PUT', configInput)).status, 409)
  passed('Members without personal keys see team models; keys are redacted and configuration saves use revisions')
  await o.ok(`/api/organizations/${team.id}/model-config/test`, 'POST', { providerId })
  passed('Saved provider credentials support connection tests without exposing secrets')

  const project = (await m.ok('/api/projects', 'POST', { name: 'Shared verification project' }, scope)).project
  assert.equal(project.organizationId, team.id)
  const np = await prisma.novelPromotionProject.findUniqueOrThrow({ where: { projectId: project.id } })
  assert.equal(np.analysisModel, modelKey)
  assert.equal((await m.request(`/api/projects/${project.id}`, 'DELETE', undefined, scope)).status, 403)
  passed('Team projects inherit team models and ordinary creators cannot delete the shared project')

  const task = await m.ok('/api/asset-hub/ai-design-character', 'POST', { userInstruction: 'Design a local test character', async: true }, scope)
  assert.ok(task.taskId)
  let state
  for (let i = 0; i < 100; i++) {
    state = await o.ok(`/api/tasks/${task.taskId}`, 'GET', undefined, scope)
    if (['completed', 'failed', 'canceled'].includes(state.task?.status ?? state.status)) break
    await wait(500)
  }
  const finished = await prisma.task.findUniqueOrThrow({ where: { id: task.taskId } })
  assert.equal(finished.status, 'completed', `Team task failed: ${finished.errorMessage}`)
  assert.equal(finished.modelConfigVersionId, firstVersionId)
  assert.equal(finished.organizationId, team.id)
  const records = await prisma.organizationUsageRecord.findMany({ where: { taskId: task.taskId } })
  assert.ok(records.length > 0)
  assert.ok(observedCredentials.includes('Bearer local-test-key-one'))
  assert.ok(records.every(record => record.quantity === 20 && Number(record.amount) === 0.00002), `Known token usage replaces conservative reservations: ${JSON.stringify(records.map(record => ({ quantity: record.quantity, amount: String(record.amount), status: record.status })))}`)
  assert.ok(records.every(record => record.userId === member.id && record.organizationId === team.id))
  const usage = await m.ok(`/api/organizations/${team.id}/usage-statistics`)
  assert.ok(usage.data.some(record => record.taskId === task.taskId))
  passed('A real queued Worker task uses team credentials and records member usage with BILLING_MODE=OFF')

  await o.ok(`/api/organizations/${team.id}/model-config`, 'PUT', { ...configInput, version: 1, providers: [{ ...configInput.providers[0], apiKey: 'local-test-key-two' }] })
  const oldCredentials = await withWorkspaceRuntime({ actorId: member.id, organizationId: team.id, billingSource: 'team_api_key', configVersionId: firstVersionId }, () => getProviderConfig(member.id, providerId))
  assert.equal(oldCredentials.apiKey, 'local-test-key-one')
  passed('Tasks retain their original encrypted provider configuration after key rotation')

  await o.ok(`/api/organizations/${team.id}/members/${member.id}`, 'PATCH', { quota: 1 })
  const beforeBudget = await memberBudget(team.id, member.id)
  const reserveAmount = Math.max(0.000001, (1 - beforeBudget.spent) * 0.75)
  const jobs = Array.from({ length: 8 }, () => `verify:${randomUUID()}`)
  const reserved = await Promise.allSettled(jobs.map(taskId => reserveTeamBudget({ organizationId: team.id, userId: member.id, taskId, amount: reserveAmount })))
  assert.equal(reserved.filter(item => item.status === 'fulfilled').length, 1)
  assert.ok((await memberBudget(team.id, member.id)).reserved <= 1)
  await Promise.all(jobs.map(releaseTeamReservation))
  assert.equal((await memberBudget(team.id, member.id)).reserved, 0)
  const tight = await memberBudget(team.id, member.id)
  await o.ok(`/api/organizations/${team.id}/members/${member.id}`, 'PATCH', { quota: Math.max(0.000001, tight.spent) })
  const configNow = await prisma.organization.findUniqueOrThrow({ where: { id: team.id } })
  let invoked = false
  await assert.rejects(withWorkspaceRuntime({ actorId: member.id, organizationId: team.id, billingSource: 'team_api_key', configVersionId: configNow.currentModelConfigId }, () => withTeamUsage({ model: modelKey, kind: 'text', quantity: 1000000, unit: 'token' }, async () => { invoked = true })), error => error.code === 'QUOTA_EXCEEDED')
  assert.equal(invoked, false)
  passed('Concurrent budget reservations cannot overspend and exhausted budgets block external calls')

  await m.ok('/api/asset-hub/characters', 'GET', undefined, scope)
  const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#28403c' } }).png().toBuffer()
  const form = new FormData()
  form.set('file', new Blob([png], { type: 'image/png' }), 'team-test.png')
  form.set('type', 'character'); form.set('id', sharedId); form.set('appearanceIndex', '0')
  await m.ok('/api/asset-hub/upload-image', 'POST', form, scope)
  const grants = await prisma.mediaScopeGrant.findMany({ where: { scopeKey: scope } })
  assert.ok(grants.length)
  const media = await prisma.mediaObject.findUniqueOrThrow({ where: { id: grants[0].mediaId } })
  mediaIds.push(media.id)
  assert.equal((await m.request(`/m/${media.publicId}`)).status, 200)
  assert.equal((await x.request(`/m/${media.publicId}`)).status, 403)
  assert.equal((await fetch(`${base}/m/${media.publicId}`)).status, 401)
  passed('Media previews enforce membership instead of relying on obscure public URLs')

  await o.ok(`/api/organizations/${team.id}/members/${member.id}`, 'PATCH', { quota: 1, status: 'frozen' })
  assert.equal((await m.request('/api/asset-hub/characters', 'GET', undefined, scope)).status, 403)
  let frozenCallInvoked = false
  await assert.rejects(withWorkspaceRuntime({ actorId: member.id, organizationId: team.id, billingSource: 'team_api_key', configVersionId: configNow.currentModelConfigId }, () => withTeamUsage({ model: modelKey, kind: 'text', quantity: 1, unit: 'token' }, async () => { frozenCallInvoked = true })), error => error.code === 'FORBIDDEN')
  assert.equal(frozenCallInvoked, false)
  await o.ok(`/api/organizations/${team.id}/members/${member.id}`, 'PATCH', { status: 'active' })
  passed('Freezing blocks team access and new external calls; unfreezing restores membership')

  const pending = await prisma.task.create({ data: { userId: member.id, organizationId: team.id, projectId: 'global-asset-hub', type: 'asset_hub_ai_design_character', targetType: 'GlobalCharacter', targetId: sharedId, modelConfigVersionId: firstVersionId, status: 'queued' } })
  await reserveTeamBudget({ organizationId: team.id, userId: member.id, taskId: pending.id, amount: 0.1 })
  async function firstEvent(session, space) {
    const abort = new AbortController(), timeout = setTimeout(() => abort.abort(), 10000)
    try {
      const response = await fetch(`${base}/api/sse?projectId=global-asset-hub&workspaceScope=${encodeURIComponent(space)}`, { headers: { Cookie: [...session.cookies].map(([key, value]) => `${key}=${value}`).join('; ') }, signal: abort.signal })
      assert.equal(response.status, 200)
      const reader = response.body.getReader()
      const chunk = await reader.read()
      await reader.cancel()
      return new TextDecoder().decode(chunk.value)
    } finally { clearTimeout(timeout); abort.abort() }
  }
  assert.ok((await firstEvent(o, scope)).includes(pending.id), 'A teammate sees the task snapshot')
  assert.ok(!(await firstEvent(m, 'personal')).includes(pending.id), 'A personal subscription excludes team tasks')
  passed('Team event streams share progress while personal subscriptions remain isolated')

  const candidateTask = await prisma.task.create({ data: { userId: owner.id, organizationId: team.id, projectId: 'global-asset-hub', type: 'asset_hub_ai_design_character', targetType: 'GlobalCharacter', targetId: sharedId, modelConfigVersionId: firstVersionId, status: 'failed' } })
  await assert.rejects(withWorkspaceRuntime({ actorId: owner.id, organizationId: team.id, taskId: candidateTask.id, expectedRevisions: { [sharedId]: -1 } }, async () => await prisma.globalCharacter.update({ where: { id: sharedId }, data: { name: 'Stale generated candidate' } })), error => error.code === 'CONFLICT')
  const candidateResult = (await prisma.task.findUniqueOrThrow({ where: { id: candidateTask.id } })).result
  assert.equal(candidateResult.reason, 'revision_conflict')
  assert.equal(candidateResult.candidate.data.name, 'Stale generated candidate')
  assert.equal((await prisma.globalCharacter.findUniqueOrThrow({ where: { id: sharedId } })).name, 'Updated shared hero')
  passed('Stale Worker writes preserve a candidate without replacing newer content')

  const spentBeforeLeave = (await memberBudget(team.id, member.id)).spent
  await m.ok(`/api/organizations/${team.id}/leave`, 'POST')
  assert.equal((await m.request('/api/asset-hub/characters', 'GET', undefined, scope)).status, 403)
  assert.equal((await prisma.task.findUniqueOrThrow({ where: { id: pending.id } })).status, 'canceled')
  assert.equal((await memberBudget(team.id, member.id)).reserved, 0)
  assert.equal((await m.request(`/m/${media.publicId}`)).status, 403)
  assert.ok(await prisma.globalCharacter.findUnique({ where: { id: sharedId } }))
  const again = (await o.ok(`/api/organizations/${team.id}/invitations`, 'POST', { account: member.name })).data
  await m.ok(`/api/user/team-invitations/${again.id}`, 'POST', { action: 'accept' })
  assert.equal((await memberBudget(team.id, member.id)).spent, spentBeforeLeave)
  passed('Leaving revokes media access, retains team content, and does not reset monthly consumption')

  await o.ok(`/api/organizations/${team.id}/transfer-owner`, 'POST', { userId: admin.id })
  assert.equal((await prisma.organization.findUniqueOrThrow({ where: { id: team.id } })).ownerId, admin.id)
  assert.equal((await prisma.organizationMember.findUniqueOrThrow({ where: { organizationId_userId: { organizationId: team.id, userId: owner.id } } })).role, 'admin')
  passed('Ownership transfer atomically updates the team and both roles')
  console.log(`Team acceptance: ${checks} checks passed.`)
} catch (error) {
  console.error('Acceptance failure:', error.message)
  throw error
} finally {
  await new Promise(resolve => fake.close(resolve))
  // Delete only the fixtures created by this invocation, never preexisting accounts or projects.
  const userIds = users.map(user => user.id)
  await prisma.organizationUsageRecord.deleteMany({ where: { organizationId: { in: teamIds } } })
  await prisma.organizationBudgetReservation.deleteMany({ where: { organizationId: { in: teamIds } } })
  await prisma.organizationBudgetPeriod.deleteMany({ where: { organizationId: { in: teamIds } } })
  await prisma.organizationModelConfigVersion.deleteMany({ where: { organizationId: { in: teamIds } } })
  await prisma.mediaScopeGrant.deleteMany({ where: { OR: [{ scopeKey: { in: teamIds.map(id => `team:${id}`) } }, { scopeKey: { in: userIds.map(id => `personal:${id}`) } }] } })
  await prisma.project.deleteMany({ where: { userId: { in: userIds } } })
  await prisma.organization.deleteMany({ where: { id: { in: teamIds } } })
  await prisma.user.deleteMany({ where: { id: { in: userIds } } })
  for (const id of mediaIds) {
    const media = await prisma.mediaObject.findUnique({ where: { id } })
    if (media) { const storageModule = await import('../src/lib/storage/index.ts'); const { deleteObject } = storageModule.default ?? storageModule; await deleteObject(media.storageKey) }
    await prisma.mediaObject.deleteMany({ where: { id } })
  }
  await prisma.$disconnect()
  const queueModule = await import('../src/lib/task/queues.ts')
  const { imageQueue, videoQueue, textQueue, voiceQueue } = queueModule.default ?? queueModule
  await Promise.all([imageQueue, videoQueue, textQueue, voiceQueue].map(queue => queue.close()))
  const redisModule = await import('../src/lib/redis.ts')
  const { redis, queueRedis } = redisModule.default ?? redisModule
  await Promise.all([redis.quit(), queueRedis.quit()])
}
