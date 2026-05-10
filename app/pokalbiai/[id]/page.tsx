// /pokalbiai/[id] — konkretus pokalbis su initial messages SSR'inta.

import { redirect, notFound } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { listMyConversations, getConversation, fetchMessages, resolveViewerId } from '@/lib/chat'
import { ChatLayout } from '@/components/chat/ChatLayout'

export const dynamic = 'force-dynamic'

export default async function PokalbisPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const convId = Number(id)
  if (!convId || isNaN(convId)) notFound()

  const session = await getServerSession(authOptions)
  // Resolve'inam į tikrą profile.id (matchina chat_participants), kad
  // assertParticipant nepasakytų FORBIDDEN po DM sukūrimo redirect'o.
  const userId = await resolveViewerId(session)
  if (!userId) redirect(`/auth/signin?callbackUrl=/pokalbiai/${convId}`)

  let conversations: any[] = []
  let conv: any = null
  let initialMessages: any[] = []

  try {
    conversations = await listMyConversations(userId)
    try {
      conv = await getConversation(convId, userId)
      initialMessages = await fetchMessages({ convId, viewerId: userId })
    } catch (e: any) {
      if (e?.code === 'FORBIDDEN') redirect('/pokalbiai')
      throw e
    }
  } catch (e: any) {
    if (!/relation .* does not exist|chat_user_conversations/i.test(e?.message || '')) throw e
  }

  return (
    <ChatLayout
      viewerId={userId}
      initialConversations={conversations}
      activeConversation={conv}
      initialMessages={initialMessages}
    />
  )
}
