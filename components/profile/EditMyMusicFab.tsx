'use client'
// components/profile/EditMyMusicFab.tsx
// Owner-only mygtukas savo profilyje → veda į /mano-muzika valdymą.
// Rodomas TIK kai prisijungusio nario id sutampa su profilio id.
import { useSession } from 'next-auth/react'
import Link from 'next/link'

export default function EditMyMusicFab({ profileId }: { profileId: string }) {
  const { data: session } = useSession()
  if (!session?.user?.id || session.user.id !== profileId) return null
  return (
    <Link
      href="/mano-muzika"
      className="fixed right-4 z-[60] inline-flex items-center gap-2 rounded-full px-4 py-3 text-[14px] font-black text-white shadow-lg transition-transform hover:scale-[1.04]"
      style={{ background: 'var(--accent-orange)', bottom: 'calc(env(safe-area-inset-bottom, 0px) + 76px)' }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
      </svg>
      Tvarkyti muziką
    </Link>
  )
}
