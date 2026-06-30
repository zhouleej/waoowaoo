import { beforeEach, describe, expect, it, vi } from 'vitest'

const prismaMock = vi.hoisted(() => ({
  project: {
    findUnique: vi.fn(),
  },
  task: {
    create: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/billing', () => ({ rollbackTaskBilling: vi.fn() }))

describe('task service tenant context', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('inherits organizationId from the project when creating a task', async () => {
    const { createTask } = await import('@/lib/task/service')

    prismaMock.project.findUnique.mockResolvedValue({ organizationId: 'org-1' })
    prismaMock.task.create.mockResolvedValue({
      id: 'task-1',
      userId: 'user-1',
      projectId: 'project-1',
      organizationId: 'org-1',
      status: 'queued',
    })

    await createTask({
      userId: 'user-1',
      projectId: 'project-1',
      type: 'image_panel',
      targetType: 'panel',
      targetId: 'panel-1',
    })

    expect(prismaMock.task.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        userId: 'user-1',
        projectId: 'project-1',
        organizationId: 'org-1',
      }),
    }))
  })

  it('filters organization task queries by organizationId without forcing user ownership', async () => {
    const { queryTasks } = await import('@/lib/task/service')

    prismaMock.task.findMany.mockResolvedValue([])

    await queryTasks({
      organizationId: 'org-1',
      projectId: 'project-1',
      limit: 25,
    })

    expect(prismaMock.task.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organizationId: 'org-1',
        projectId: 'project-1',
      }),
      take: 25,
    }))
    expect(prismaMock.task.findMany.mock.calls[0][0].where.userId).toBeUndefined()
  })

  it('filters personal task queries by userId and null organizationId', async () => {
    const { queryTasks } = await import('@/lib/task/service')

    prismaMock.task.findMany.mockResolvedValue([])

    await queryTasks({
      userId: 'user-1',
      organizationId: null,
    })

    expect(prismaMock.task.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        userId: 'user-1',
        organizationId: null,
      }),
    }))
  })
})
