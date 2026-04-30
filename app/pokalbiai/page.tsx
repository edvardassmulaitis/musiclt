// /pokalbiai — sidebar su pokalbių sąrašu, dešinėje empty state.
// Server-rendered initial data → klientas perima realtime'ą.

import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { listMyConversations } from '@/lib/chat'
import { ChatLayout } from '@/components/chat/ChatLayout'

export const dynamic = 'force-dynamic'

export default async function PokalbiaiPage() {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as any)?.id
  if (!userId) redirect('/auth/signin?callbackUrl=/pokalbiai')

  let conversations: any[] = []
  try {
    conversations = await listMyConversations(userId)
  } catch (e: any) {
    // Migracija dar neaplikuota → tuščias state'as.
    if (!/relation .* does not exist|chat_user_conversations/i.test(e?.message || '')) throw e
  }

  return (
    <ChatLayout
      viewerId={userId}
      initialConversations={conversations}
      activeConversation={null}
      initialMessages={[]}
    />
  )
}
