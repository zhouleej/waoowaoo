import { randomUUID } from 'node:crypto'
import { queueRedis } from '@/lib/redis'
import { workspaceRuntime } from './runtime'

const acquire = `
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])
if redis.call('ZCARD', KEYS[1]) >= tonumber(ARGV[3]) then return 0 end
redis.call('ZADD', KEYS[1], ARGV[2], ARGV[4])
redis.call('PEXPIRE', KEYS[1], 90000)
return 1`

export async function withTeamConcurrency<T>(kind: string, run: () => Promise<T>): Promise<T> {
  const { organizationId } = workspaceRuntime()
  if (!organizationId) return run()
  const queue = kind === 'audio' ? 'voice' : kind === 'text' ? 'text' : kind === 'image' ? 'image' : 'video'
  const configured = Number(process.env[`QUEUE_CONCURRENCY_${queue.toUpperCase()}`] ?? (queue === 'video' ? 2 : 20))
  const limit = Number.isInteger(configured) && configured > 0 ? configured : 1
  const key = `team-concurrency:${organizationId}:${queue}`, token = randomUUID()
  while (!await queueRedis.eval(acquire, 1, key, Date.now(), Date.now() + 90000, limit, token)) {
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  const renew = setInterval(() => { void queueRedis.multi().zadd(key, 'XX', Date.now() + 90000, token).pexpire(key, 90000).exec().catch(() => undefined) }, 10000)
  try { return await run() }
  finally { clearInterval(renew); await queueRedis.zrem(key, token) }
}
