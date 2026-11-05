import TeamDashboard from '@/components/teams/TeamDashboard'
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <TeamDashboard id={id} />
}
