import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  organizationMember: { findUnique: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  organizationInvitation: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), create: vi.fn(), update: vi.fn() },
  user: { findUnique: vi.fn() }, enterpriseAuditLog: { create: vi.fn() }, $queryRaw: vi.fn(), $transaction: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({ prisma: mocks }))
import { inviteAccount, respondToInvitation, updateTeamMember } from '@/lib/workspace/teams'

const owner = { id: 'owner-membership', userId: 'owner', role: 'owner', status: 'active', organization: { status: 'active', currentPlan: null } }
const invitation = { id: 'invitation', organizationId: 'team', inviteeUserId: 'alice', invitedById: 'owner', role: 'member', status: 'pending', expiresAt: new Date('2099-01-01') }

describe('account invitations and team roles', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.$transaction.mockImplementation(run => run(mocks))
    mocks.organizationInvitation.findUniqueOrThrow.mockImplementation(args => mocks.organizationInvitation.findUnique(args))
    mocks.organizationMember.findUnique.mockResolvedValue(owner)
    mocks.organizationInvitation.findUnique.mockResolvedValue(invitation)
  })
  it('does not grant membership when sending an invitation', async () => {
    mocks.user.findUnique.mockResolvedValue({ id: 'alice', name: 'Alice', isGlobalLocked: false })
    mocks.organizationMember.findUnique.mockResolvedValueOnce(owner).mockResolvedValueOnce(null)
    mocks.organizationInvitation.findUnique.mockResolvedValue(null)
    mocks.organizationInvitation.create.mockResolvedValue(invitation)
    await inviteAccount('team', 'owner', 'Alice', 'member')
    expect(mocks.organizationMember.create).not.toHaveBeenCalled()
    expect(mocks.organizationInvitation.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ inviteeUserId: 'alice', role: 'member' }) }))
  })
  it('rejects accepting an invitation intended for another account', async () => {
    await expect(respondToInvitation('invitation', 'intruder', true)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(mocks.organizationMember.create).not.toHaveBeenCalled()
  })
  it('rechecks inviter permissions before accepting an administrator invitation', async () => {
    mocks.organizationInvitation.findUnique.mockResolvedValue({ ...invitation, role: 'admin' })
    mocks.organizationMember.findUnique.mockResolvedValue({ ...owner, role: 'admin' })
    await expect(respondToInvitation('invitation', 'alice', true)).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(mocks.organizationMember.create).not.toHaveBeenCalled()
  })
  it('rejects expired invitations without adding a member', async () => {
    mocks.organizationInvitation.findUnique.mockResolvedValue({ ...invitation, expiresAt: new Date('2000-01-01') })
    await expect(respondToInvitation('invitation', 'alice', true)).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(mocks.organizationMember.create).not.toHaveBeenCalled()
  })
  it('accepts retries of an already accepted invitation without another membership', async () => {
    mocks.organizationInvitation.findUnique.mockResolvedValue({ ...invitation, status: 'accepted' })
    expect(await respondToInvitation('invitation', 'alice', true)).toEqual({ organizationId: 'team', status: 'accepted' })
    expect(mocks.organizationMember.create).not.toHaveBeenCalled()
  })
  it('prevents an administrator from promoting a member, even through a forged request', async () => {
    mocks.organizationMember.findUnique.mockResolvedValueOnce({ ...owner, role: 'admin' }).mockResolvedValueOnce({ id: 'alice-membership', role: 'member', status: 'active' })
    await expect(updateTeamMember('team', 'owner', 'alice', { role: 'admin' })).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(mocks.organizationMember.update).not.toHaveBeenCalled()
  })
  it('never freezes or removes the team owner through ordinary member operations', async () => {
    mocks.organizationMember.findUnique.mockResolvedValue(owner)
    await expect(updateTeamMember('team', 'admin', 'owner', { status: 'frozen' })).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(mocks.organizationMember.update).not.toHaveBeenCalled()
    expect(mocks.organizationMember.delete).not.toHaveBeenCalled()
  })
})
