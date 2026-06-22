'use client'

import { useState } from 'react'
import { TrackInfoModal, type ModalTrack } from '@/components/TrackInfoModal'
import type { AbroadTopTrack } from '@/lib/verta-keliones-db'

// „Klausytis" mygtukas VK detalės puslapyje — atidaro atlikėjo populiariausią
// dainą per TrackInfoModal (tas pats grotuvas kaip visoj svetainėj).
export default function VKPlayButton({ track, artistName, artistSlug }: {
  track: AbroadTopTrack; artistName: string; artistSlug: string
}) {
  const [open, setOpen] = useState(false)
  const t: ModalTrack = { id: track.id, title: track.title, slug: track.slug, video_url: track.video_url, cover_url: track.cover_url }
  return (
    <>
      <button type="button" className="vkd-play" onClick={() => setOpen(true)}>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
        Klausytis: {track.title}
      </button>
      {open && (
        <TrackInfoModal track={t} artistName={artistName} artistSlug={artistSlug} onClose={() => setOpen(false)} />
      )}
    </>
  )
}
