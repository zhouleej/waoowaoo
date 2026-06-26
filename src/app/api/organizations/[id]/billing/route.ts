import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isErrorResponse, requireUserAuth } from '@/lib/api-auth'
import { requireOrganizationRole } from '@/lib/saas/permissions'
import { serializeInvoice, serializeOrder, serializeOrganization, serializePlan } from '@/lib/saas/serializers'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Ctx) {
  const auth = await requireUserAuth()
  if (isErrorResponse(auth)) return auth
  const { id } = await params
  const perm = await requireOrganizationRole(id, auth.session.user.id, ['owner', 'admin'])
  if (perm.error) return perm.error
  const organization = await prisma.organization.findUnique({
    where: { id },
    include: {
      balance: true,
      currentPlan: { include: { entitlements: true } },
      subscriptions: { take: 5, orderBy: { createdAt: 'desc' }, include: { plan: { include: { entitlements: true } } } },
      orders: { take: 10, orderBy: { createdAt: 'desc' }, include: { invoice: true, plan: true } },
      invoices: { take: 10, orderBy: { createdAt: 'desc' }, include: { order: true } },
      organizationUsages: { take: 20, orderBy: { createdAt: 'desc' } },
    },
  })
  if (!organization) return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
  return NextResponse.json({
    data: {
      organization: serializeOrganization(organization),
      currentPlan: organization.currentPlan ? serializePlan(organization.currentPlan) : null,
      subscriptions: organization.subscriptions,
      orders: organization.orders.map(serializeOrder),
      invoices: organization.invoices.map(serializeInvoice),
      usages: organization.organizationUsages,
    },
  })
}
