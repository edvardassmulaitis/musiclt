// Redirect from old path to new path
import { redirect } from 'next/navigation'
export default async function Redirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/diskusijos/tema/${id}`)
}
