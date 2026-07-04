'use client'

// app/auth/profile/page.tsx
// Nustatymai ir paskyros valdymas. V3 (2026-06): buvęs „dashboardas" (nuorodų
// plytelės) perdarytas į tikrą nustatymų skydą — šoninis meniu + sekcijos,
// info redaguojama TIESIAI čia (inline). Surinkti VISI nustatymai vienoje
// vietoje: profilio info / „Apie mane", viešo profilio rodinys, pranešimai
// (inline), išvaizda (šviesi/tamsi tema), paskyra. Nieko naujo nesukurta —
// tik suvienyta tai, kas buvo išbarstyta (modale ant viešo profilio, atskirame
// /pranesimai puslapyje, header'io dropdown'e).

import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { proxyImg } from '@/lib/img-proxy'
import { useSite } from '@/components/SiteContext'
import { getPushStatus, enablePush, disablePush, type PushStatus } from '@/lib/push-client'

type Profile = {
  id: string
  username: string | null
  full_name: string | null
  avatar_url: string | null
  bio?: string | null
  legacy_signature?: string | null
  legacy_city?: string | null
  legacy_birth_date?: string | null
  legacy_favorite_books?: string | null
  legacy_favorite_films?: string | null
  legacy_profile_photos?: { url: string; thumb_url?: string; caption?: string }[] | null
  default_profile_tab?: string | null
  is_public?: boolean | null
  hide_from_homepage?: boolean | null
}

type Photo = { url: string; thumb_url?: string; caption?: string }

// 36 muzikinių avatarų kolekcija (SVG, public/avatars/).
const AVATAR_COLLECTION = Array.from({ length: 36 }, (_, i) => `/avatars/av-${String(i + 1).padStart(2, '0')}.svg`)

const LT_CITIES = ['Vilnius', 'Kaunas', 'Klaipėda', 'Šiauliai', 'Panevėžys', 'Alytus', 'Marijampolė', 'Mažeikiai', 'Jonava', 'Utena', 'Kėdainiai', 'Telšiai', 'Tauragė', 'Ukmergė', 'Visaginas', 'Plungė', 'Kretinga', 'Palanga', 'Radviliškis', 'Druskininkai']
const CITY_OPTIONS = [...LT_CITIES, 'Užsienis', 'Kita']

// ── Ikonos (Lucide stilius, inline) ─────────────────────────────────────────
type IconProps = { className?: string }
const sv = (className?: string) => ({
  className, width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none',
  stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
})
const IcUser = ({ className }: IconProps) => <svg {...sv(className)}><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
const IcEye = ({ className }: IconProps) => <svg {...sv(className)}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>
const IcBell = ({ className }: IconProps) => <svg {...sv(className)}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
const IcPaint = ({ className }: IconProps) => <svg {...sv(className)}><circle cx="13.5" cy="6.5" r=".5" fill="currentColor" /><circle cx="17.5" cy="10.5" r=".5" fill="currentColor" /><circle cx="8.5" cy="7.5" r=".5" fill="currentColor" /><circle cx="6.5" cy="12.5" r=".5" fill="currentColor" /><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2Z" /></svg>
const IcSettings = ({ className }: IconProps) => <svg {...sv(className)}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" /></svg>
const IcCheck = ({ className }: IconProps) => <svg {...sv(className)}><polyline points="20 6 9 17 4 12" /></svg>
const IcSun = ({ className }: IconProps) => <svg {...sv(className)}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" /></svg>
const IcMoon = ({ className }: IconProps) => <svg {...sv(className)}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
const IcLogout = ({ className }: IconProps) => <svg {...sv(className)}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
const IcLock = ({ className }: IconProps) => <svg {...sv(className)}><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>

type SectionKey = 'profilis' | 'rodinys' | 'pranesimai' | 'isvaizda' | 'paskyra'

const NAV: { key: SectionKey; label: string; icon: ReactNode }[] = [
  { key: 'profilis', label: 'Profilis', icon: <IcUser /> },
  { key: 'rodinys', label: 'Profilio išdėstymas', icon: <IcEye /> },
  { key: 'pranesimai', label: 'Pranešimai', icon: <IcBell /> },
  { key: 'isvaizda', label: 'Išvaizda', icon: <IcPaint /> },
  { key: 'paskyra', label: 'Paskyra', icon: <IcSettings /> },
]

const DEFAULT_VIEW_OPTIONS: { key: string; label: string; sub: string }[] = [
  { key: 'auto', label: 'Automatinis', sub: 'Turi įrašų → įrašai; jei nėra → Mėgstama muzika' },
  { key: 'all', label: 'Įrašai', sub: 'Tavo srautas — straipsniai, įspūdžiai, dienos dainos' },
  { key: 'likes', label: 'Mėgstama muzika', sub: 'Atlikėjai, albumai ir dainos, kurias pamėgai' },
  { key: 'about', label: 'Apie mane', sub: 'Profilio aprašymas ir informacija' },
]

export default function SettingsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { dk, setTheme } = useSite()

  const [profile, setProfile] = useState<Profile | null>(null)
  const [section, setSection] = useState<SectionKey>('profilis')

  // ── Profilio laukai ──
  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [signature, setSignature] = useState('')
  const [bio, setBio] = useState('')
  const [city, setCity] = useState('')
  const [birthYear, setBirthYear] = useState('')
  const [books, setBooks] = useState('')
  const [films, setFilms] = useState('')
  const [photos, setPhotos] = useState<Photo[]>([])

  const [pickerOpen, setPickerOpen] = useState(false)
  const [uploading, setUploading] = useState<string | null>(null)
  const [savingProfile, setSavingProfile] = useState(false)
  const [savedProfile, setSavedProfile] = useState(false)
  const [profileErr, setProfileErr] = useState<string | null>(null)
  const photoInput = useRef<HTMLInputElement>(null)
  const avatarInput = useRef<HTMLInputElement>(null)

  // ── Profilio rodinys ──
  const [defaultTab, setDefaultTab] = useState('auto')
  const [savedTab, setSavedTab] = useState(false)

  // ── Anketos (de)aktyvavimas ──
  const [isPublic, setIsPublic] = useState(true)
  const [deactConfirm, setDeactConfirm] = useState(false)
  const [deactAck, setDeactAck] = useState(false)
  const [deactBusy, setDeactBusy] = useState(false)

  // ── Pranešimai ──
  const [prefs, setPrefs] = useState<Record<string, boolean>>({})
  const [prefsLoaded, setPrefsLoaded] = useState(false)
  const [savingPref, setSavingPref] = useState<string | null>(null)
  const [pushStatus, setPushStatus] = useState<PushStatus | null>(null)
  const [pushBusy, setPushBusy] = useState(false)
  const [pushError, setPushError] = useState<string | null>(null)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/auth/signin')
  }, [status, router])

  useEffect(() => {
    if (status !== 'authenticated') return
    fetch('/api/profile').then(r => r.json()).then((d: Profile & { error?: string }) => {
      if (d && !d.error) {
        setProfile(d)
        setFullName(d.full_name || '')
        setUsername(d.username || '')
        setAvatarUrl(d.avatar_url || '')
        setSignature(d.legacy_signature || '')
        setBio(d.bio || '')
        setCity(d.legacy_city || '')
        setBooks(d.legacy_favorite_books || '')
        setFilms(d.legacy_favorite_films || '')
        setPhotos(Array.isArray(d.legacy_profile_photos) ? d.legacy_profile_photos : [])
        setDefaultTab(d.default_profile_tab || 'auto')
        setIsPublic(d.is_public !== false)
        const y = d.legacy_birth_date ? new Date(d.legacy_birth_date).getFullYear() : ''
        setBirthYear(y ? String(y) : '')
      }
    }).catch(() => {})
  }, [status])

  // Pranešimų prefs + push (užkraunam iškart, kad skirtukas būtų greitas)
  useEffect(() => {
    if (status !== 'authenticated') return
    let aborted = false
    ;(async () => {
      try {
        const res = await fetch('/api/notifications/preferences', { cache: 'no-store' })
        const json = await res.json()
        if (aborted) return
        const map: Record<string, boolean> = {}
        for (const t of NOTIF_TYPES) map[t.type] = true
        for (const p of (json.preferences || []) as { type: string; enabled: boolean }[]) map[p.type] = !!p.enabled
        setPrefs(map)
      } catch { /* keep defaults */ } finally {
        if (!aborted) setPrefsLoaded(true)
      }
    })()
    ;(async () => {
      try { const s = await getPushStatus(); if (!aborted) setPushStatus(s) }
      catch { if (!aborted) setPushStatus('unsupported') }
    })()
    return () => { aborted = true }
  }, [status])

  async function uploadFile(file: File): Promise<string | null> {
    const fd = new FormData(); fd.append('file', file)
    const r = await fetch('/api/upload', { method: 'POST', body: fd })
    const d = await r.json()
    if (!r.ok) throw new Error(d?.error || 'Įkėlimas nepavyko')
    return d.url || null
  }

  const onPickAvatarFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return
    setUploading('avatar'); setProfileErr(null)
    try { const u = await uploadFile(f); if (u) { setAvatarUrl(u); setPickerOpen(false) } }
    catch (x: any) { setProfileErr(x.message) } finally { setUploading(null) }
  }
  const onPickPhotos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []); if (!files.length) return
    setUploading('photo'); setProfileErr(null)
    try { for (const f of files.slice(0, 8)) { const u = await uploadFile(f); if (u) setPhotos(p => [...p, { url: u }]) } }
    catch (x: any) { setProfileErr(x.message) } finally { setUploading(null) }
  }

  async function saveProfile() {
    setSavingProfile(true); setProfileErr(null); setSavedProfile(false)
    const body: Record<string, any> = {
      full_name: fullName.trim() || null,
      avatar_url: avatarUrl || null,
      bio: bio.trim() || null,
      legacy_signature: signature.trim() || null,
      legacy_city: city.trim() || null,
      legacy_favorite_books: books.trim() || null,
      legacy_favorite_films: films.trim() || null,
      legacy_profile_photos: photos,
    }
    const y = parseInt(birthYear, 10)
    if (y >= 1900 && y <= new Date().getFullYear()) body.legacy_birth_date = `${y}-06-15`
    else if (!birthYear) body.legacy_birth_date = null
    try {
      const r = await fetch('/api/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = await r.json()
      if (!r.ok) throw new Error(d?.error || 'Nepavyko išsaugoti')
      setProfile(p => p ? { ...p, ...body } : p)
      setSavedProfile(true)
      setTimeout(() => setSavedProfile(false), 2400)
      router.refresh()
    } catch (x: any) { setProfileErr(x.message) } finally { setSavingProfile(false) }
  }

  const saveDefaultTab = async (key: string) => {
    setDefaultTab(key); setSavedTab(false)
    try {
      const r = await fetch('/api/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ default_profile_tab: key }) })
      if (r.ok) { setSavedTab(true); setTimeout(() => setSavedTab(false), 2200) }
    } catch { /* tylim */ }
  }

  const setAnketaActive = async (active: boolean) => {
    setDeactBusy(true)
    try {
      const r = await fetch('/api/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_public: active, hide_from_homepage: !active }) })
      if (r.ok) { setIsPublic(active); setDeactConfirm(false); setDeactAck(false); router.refresh() }
    } catch { /* tylim */ } finally { setDeactBusy(false) }
  }

  const toggleNotif = async (type: string) => {
    const next = !prefs[type]
    setPrefs(p => ({ ...p, [type]: next })); setSavingPref(type)
    try {
      await fetch('/api/notifications/preferences', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, enabled: next }) })
    } catch { setPrefs(p => ({ ...p, [type]: !next })) } finally { setSavingPref(null) }
  }
  const masterNotif = async (turnOn: boolean) => {
    const next: Record<string, boolean> = {}
    for (const t of NOTIF_TYPES) next[t.type] = turnOn
    setPrefs(next); setSavingPref('__all')
    try {
      await fetch('/api/notifications/preferences', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: NOTIF_TYPES.map(t => ({ type: t.type, enabled: turnOn })) }) })
    } catch { /* ignore */ } finally { setSavingPref(null) }
  }
  const togglePush = async () => {
    setPushBusy(true); setPushError(null)
    try {
      if (pushStatus === 'subscribed') { await disablePush(); setPushStatus('unsubscribed') }
      else {
        const res = await enablePush()
        if (res.ok) setPushStatus('subscribed')
        else { setPushStatus(res.status); if (res.error) setPushError(res.error) }
      }
    } catch (e: any) { setPushError(e?.message || 'Klaida') } finally { setPushBusy(false) }
  }

  if (status === 'loading') {
    return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 rounded-full animate-spin" style={{ border: '2px solid var(--accent-orange)', borderTopColor: 'transparent' }} /></div>
  }
  if (!session) return null

  const user = session.user
  const isAdmin = ['editor', 'admin', 'super_admin'].includes(user.role || '')
  const avatar = avatarUrl || user.image || null
  const name = fullName || profile?.full_name || user.name || 'Vartotojas'
  const uname = profile?.username || null
  const roleLabel = user.role === 'super_admin' ? 'Super administratorius'
    : user.role === 'admin' ? 'Administratorius'
    : user.role === 'editor' ? 'Redaktorius'
    : user.role === 'moderator' ? 'Moderatorius' : 'Narys'

  return (
    <div className="page-shell" style={{ color: 'var(--text-primary)', fontFamily: "'Outfit', sans-serif" }}>
      <div className="page-head" style={{ marginBottom: 18 }}>
        <h1>Nustatymai</h1>
        <p>Tvarkyk savo profilio informaciją, viešą rodinį, pranešimus ir paskyrą — viskas vienoje vietoje.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[238px_1fr] gap-5 lg:gap-7">

        {/* ── ŠONINIS MENIU ── */}
        <aside className="lg:sticky lg:top-20 self-start">
          {/* Tapatybės kortelė */}
          <div className="flex items-center gap-3 rounded-2xl p-3.5 mb-3"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}>
            {avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatar.startsWith('/') ? avatar : proxyImg(avatar)} alt={name} referrerPolicy="no-referrer"
                className="h-11 w-11 rounded-xl object-cover shrink-0" style={{ border: '1px solid var(--border-default)' }} />
            ) : (
              <div className="h-11 w-11 rounded-xl flex items-center justify-center text-base font-black text-white shrink-0"
                style={{ background: 'linear-gradient(135deg,#2563eb,var(--accent-orange))' }}>{name[0]?.toUpperCase() || '?'}</div>
            )}
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-black truncate leading-tight">{name}</div>
              {uname && <div className="text-[14px] truncate" style={{ color: 'var(--text-muted)' }}>@{uname}</div>}
            </div>
            {uname && (
              <Link href={`/@${uname}`} title="Peržiūrėti viešą profilį" aria-label="Peržiūrėti viešą profilį"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition hover:opacity-85"
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}>
                <IcEye />
              </Link>
            )}
          </div>

          {/* Navigacija */}
          <nav className="flex lg:flex-col gap-1.5 overflow-x-auto lg:overflow-visible pb-1 lg:pb-0 -mx-1 px-1">
            {NAV.map(item => {
              const active = section === item.key
              return (
                <button key={item.key} type="button" onClick={() => setSection(item.key)}
                  className="flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-[14.5px] font-bold transition whitespace-nowrap shrink-0 lg:w-full"
                  style={{
                    background: active ? 'rgba(249,115,22,0.12)' : 'transparent',
                    border: `1px solid ${active ? 'rgba(249,115,22,0.30)' : 'transparent'}`,
                    color: active ? 'var(--accent-orange)' : 'var(--text-secondary)',
                  }}>
                  <span className="shrink-0">{item.icon}</span>{item.label}
                </button>
              )
            })}
          </nav>

        </aside>

        {/* ── TURINYS ── */}
        <div className="min-w-0">

          {section === 'profilis' && (
            <Card>
              <CardHead title="Profilis" sub="Informacija, kurią matys kiti, atvėrę tavo viešą profilį." />

              {/* Avatar */}
              <Label>Avataras</Label>
              <div className="flex items-center gap-3 mb-1 flex-wrap">
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl.startsWith('/') ? avatarUrl : proxyImg(avatarUrl)} alt="" className="w-16 h-16 rounded-2xl object-cover shrink-0" style={{ border: '1px solid var(--border-default)' }} />
                ) : (
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-black shrink-0" style={{ background: 'var(--card-bg)', border: '1px solid var(--border-default)', color: 'var(--text-muted)' }}>{name[0]?.toUpperCase()}</div>
                )}
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setPickerOpen(o => !o)}
                    className="px-4 py-2 rounded-lg text-[14px] font-bold transition hover:opacity-85"
                    style={{ background: 'var(--card-bg)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}>
                    {pickerOpen ? 'Slėpti' : 'Keisti avatarą'}
                  </button>
                  <button type="button" onClick={() => avatarInput.current?.click()} disabled={uploading === 'avatar'}
                    className="px-4 py-2 rounded-lg text-[14px] font-bold transition hover:opacity-85 disabled:opacity-60"
                    style={{ background: 'var(--card-bg)', border: '1px solid var(--border-default)', color: 'var(--accent-orange)' }}>
                    {uploading === 'avatar' ? 'Keliama…' : '+ Įkelti savo'}
                  </button>
                  <input ref={avatarInput} type="file" accept="image/*" className="hidden" onChange={onPickAvatarFile} />
                </div>
              </div>
              {pickerOpen && (
                <div className="grid grid-cols-6 sm:grid-cols-9 gap-2 rounded-xl p-2.5 mb-1" style={{ background: 'var(--card-bg)', border: '1px solid var(--border-subtle)' }}>
                  {AVATAR_COLLECTION.map(u => {
                    const on = avatarUrl === u
                    return (
                      <button key={u} type="button" onClick={() => { setAvatarUrl(u); setPickerOpen(false) }}
                        className="relative aspect-square rounded-lg overflow-hidden transition hover:scale-[1.06]"
                        style={{ outline: on ? '2px solid var(--accent-orange)' : '1px solid var(--border-subtle)', outlineOffset: on ? '1px' : '0' }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={u} alt="" className="w-full h-full object-cover" loading="lazy" />
                      </button>
                    )
                  })}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-4 mt-4">
                <div>
                  <Label>Vardas</Label>
                  <Inp value={fullName} onChange={setFullName} maxLength={60} placeholder="Tavo vardas" />
                </div>
                <div>
                  <Label>Naudotojo vardas</Label>
                  <div className="flex items-stretch rounded-lg overflow-hidden cursor-not-allowed" style={{ border: '1px solid var(--border-default)', background: 'var(--bg-hover)' }}>
                    <span className="flex items-center px-2.5 text-[14px]" style={{ color: 'var(--text-muted)', borderRight: '1px solid var(--border-default)' }}>@</span>
                    <input className="flex-1 px-2.5 py-2 text-sm bg-transparent outline-none cursor-not-allowed" style={{ color: 'var(--text-muted)' }}
                      value={username} disabled readOnly aria-disabled placeholder="vardas" />
                    <span className="flex items-center pr-2.5" style={{ color: 'var(--text-faint)' }}><IcLock className="h-3.5 w-3.5" /></span>
                  </div>
                  <Hint>music.lt/@{username || 'vardas'} · vardo keisti negalima</Hint>
                </div>
              </div>

              <div className="mt-4">
                <Label>Trumpai apie save</Label>
                <Inp value={signature} onChange={setSignature} maxLength={160} placeholder="Viena eilutė apie tave…" />
              </div>

              <div className="mt-4">
                <Label>Aprašymas</Label>
                <textarea className="w-full px-3 py-2 rounded-lg text-sm min-h-[110px] resize-y outline-none"
                  style={fieldStyle} value={bio} maxLength={2000} onChange={e => setBio(e.target.value)} placeholder="Apie tave, tavo muzikinį skonį, veiklą…" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-4 mt-4">
                <div>
                  <Label>Miestas</Label>
                  <select className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={fieldStyle}
                    value={(!city || CITY_OPTIONS.includes(city)) ? city : 'Kita'} onChange={e => setCity(e.target.value)}>
                    <option value="">—</option>
                    {CITY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                    {city && !CITY_OPTIONS.includes(city) && <option value={city}>{city}</option>}
                  </select>
                </div>
                <div>
                  <Label>Gimimo metai</Label>
                  <Inp value={birthYear} onChange={v => setBirthYear(v.replace(/[^0-9]/g, ''))} maxLength={4} placeholder="pvz. 1998" />
                </div>
                <div>
                  <Label>Mėgstamiausios knygos</Label>
                  <Inp value={books} onChange={setBooks} maxLength={300} placeholder="autorius — pavadinimas…" />
                </div>
                <div>
                  <Label>Mėgstamiausi filmai</Label>
                  <Inp value={films} onChange={setFilms} maxLength={300} placeholder="režisierius — pavadinimas…" />
                </div>
              </div>

              <div className="mt-4">
                <Label>Nario nuotraukos</Label>
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                  {photos.map((p, i) => (
                    <div key={i} className="relative aspect-square rounded-lg overflow-hidden" style={{ border: '1px solid var(--border-subtle)' }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.thumb_url || p.url} alt="" className="w-full h-full object-cover" />
                      <button type="button" onClick={() => setPhotos(arr => arr.filter((_, j) => j !== i))}
                        className="absolute top-1 right-1 w-6 h-6 rounded-full flex items-center justify-center text-[14px] text-white" style={{ background: 'rgba(0,0,0,0.6)' }} aria-label="Pašalinti">✕</button>
                    </div>
                  ))}
                  <button type="button" onClick={() => photoInput.current?.click()} disabled={uploading === 'photo'}
                    className="aspect-square rounded-lg flex items-center justify-center text-[13px] font-bold transition hover:opacity-85 disabled:opacity-60"
                    style={{ background: 'var(--card-bg)', border: '1px dashed var(--border-default)', color: 'var(--accent-orange)' }}>
                    {uploading === 'photo' ? '…' : '+ Įkelti'}
                  </button>
                  <input ref={photoInput} type="file" accept="image/*" multiple className="hidden" onChange={onPickPhotos} />
                </div>
              </div>

              {profileErr && <p className="text-[14px] font-semibold mt-4" style={{ color: '#ef4444' }}>{profileErr}</p>}

              <div className="flex items-center justify-end gap-3 mt-6 pt-4" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                {savedProfile && <span className="inline-flex items-center gap-1 text-[14.5px] font-bold" style={{ color: '#34d399' }}><IcCheck className="h-3.5 w-3.5" /> Išsaugota</span>}
                <button type="button" onClick={saveProfile} disabled={savingProfile || !!uploading}
                  className="px-5 py-2.5 rounded-xl text-[14.5px] font-extrabold transition hover:opacity-90 disabled:opacity-60"
                  style={{ background: 'var(--accent-orange)', color: '#fff' }}>
                  {savingProfile ? 'Saugoma…' : 'Išsaugoti pakeitimus'}
                </button>
              </div>
            </Card>
          )}

          {section === 'rodinys' && (
            <Card>
              <CardHead title="Profilio išdėstymas" sub="Ką lankytojai mato pirma, atvėrę tavo viešą profilį."
                right={savedTab ? <span className="inline-flex items-center gap-1 text-[13.5px] font-bold" style={{ color: '#34d399' }}><IcCheck className="h-3.5 w-3.5" /> Išsaugota</span> : null} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {DEFAULT_VIEW_OPTIONS.map(opt => {
                  const active = defaultTab === opt.key
                  return (
                    <button key={opt.key} type="button" onClick={() => saveDefaultTab(opt.key)}
                      className="text-left rounded-xl p-3.5 transition"
                      style={{ background: active ? 'rgba(249,115,22,0.10)' : 'var(--bg-elevated)', border: `1px solid ${active ? 'var(--accent-orange)' : 'var(--border-default)'}` }}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[14.5px] font-bold" style={{ color: active ? 'var(--accent-orange)' : 'var(--text-primary)' }}>{opt.label}</span>
                        <span className="flex h-4 w-4 items-center justify-center rounded-full shrink-0" style={{ border: `1.5px solid ${active ? 'var(--accent-orange)' : 'var(--border-default)'}`, background: active ? 'var(--accent-orange)' : 'transparent' }}>{active && <IcCheck className="h-2.5 w-2.5" />}</span>
                      </div>
                      <div className="text-[13.5px] mt-1 leading-snug" style={{ color: 'var(--text-muted)' }}>{opt.sub}</div>
                    </button>
                  )
                })}
              </div>
            </Card>
          )}

          {section === 'pranesimai' && (
            <Card>
              <CardHead title="Pranešimai" sub="Pasirink, kokius pranešimus nori gauti. Jie pasirodo varpelio ikonoje viršuje." />
              {!prefsLoaded ? (
                <div className="py-8 flex justify-center"><div className="w-6 h-6 rounded-full animate-spin" style={{ border: '2px solid var(--accent-orange)', borderTopColor: 'transparent' }} /></div>
              ) : (
                <NotificationsBody
                  prefs={prefs} savingPref={savingPref} toggleNotif={toggleNotif} masterNotif={masterNotif}
                  pushStatus={pushStatus} pushBusy={pushBusy} pushError={pushError} togglePush={togglePush} />
              )}
            </Card>
          )}

          {section === 'isvaizda' && (
            <Card>
              <CardHead title="Išvaizda" sub="Tema taikoma visam music.lt — išsaugoma šioje naršyklėje." />
              <Label>Tema</Label>
              <div className="grid grid-cols-2 gap-2.5 max-w-md">
                <ThemeOpt active={!dk} icon={<IcSun />} label="Šviesi" onClick={() => setTheme('light')} />
                <ThemeOpt active={dk} icon={<IcMoon />} label="Tamsi" onClick={() => setTheme('dark')} />
              </div>
            </Card>
          )}

          {section === 'paskyra' && (
            <>
              <Card>
                <CardHead title="Paskyra" sub="Prisijungimo informacija ir valdymas." />
                <div className="flex items-center justify-between text-[14.5px] py-2">
                  <span style={{ color: 'var(--text-muted)' }}>El. paštas</span>
                  <span className="truncate ml-3">{user.email}</span>
                </div>
                <div className="flex items-center justify-between text-[14.5px] py-2" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Rolė</span>
                  <span className="ml-3 font-bold" style={{ color: isAdmin ? 'var(--accent-orange)' : 'var(--text-primary)' }}>{roleLabel}</span>
                </div>
              </Card>

              <Card className="mt-4">
                <CardHead title="Anketa" sub={isPublic ? 'Tavo profilis šiuo metu matomas kitiems.' : 'Tavo anketa deaktyvuota — profilis paslėptas.'} />
                {isPublic ? (
                  !deactConfirm ? (
                    <button type="button" onClick={() => setDeactConfirm(true)}
                      className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[14px] font-bold transition hover:opacity-85"
                      style={{ background: 'rgba(244,63,94,0.10)', border: '1px solid rgba(244,63,94,0.30)', color: '#f43f5e' }}>
                      Deaktyvuoti anketą
                    </button>
                  ) : (
                    <div className="rounded-xl p-4" style={{ background: 'rgba(244,63,94,0.06)', border: '1px solid rgba(244,63,94,0.25)' }}>
                      <div className="text-[14.5px] font-bold" style={{ color: '#f43f5e' }}>Deaktyvuoti anketą?</div>
                      <ul className="text-[14.5px] mt-2 leading-relaxed list-disc pl-4" style={{ color: 'var(--text-secondary)' }}>
                        <li>Tavo viešas profilis taps nematomas (puslapis grąžins „nerasta“).</li>
                        <li>Būsi paslėptas iš bendruomenės ir narių sąrašų.</li>
                        <li>Duomenys NEbus ištrinti — bet kada gali vėl aktyvuoti.</li>
                      </ul>
                      <label className="flex items-center gap-2 mt-3 text-[14.5px] cursor-pointer" style={{ color: 'var(--text-primary)' }}>
                        <input type="checkbox" checked={deactAck} onChange={e => setDeactAck(e.target.checked)} />
                        Suprantu ir noriu deaktyvuoti savo anketą.
                      </label>
                      <div className="flex gap-2.5 mt-3">
                        <button type="button" onClick={() => { setDeactConfirm(false); setDeactAck(false) }}
                          className="rounded-xl px-4 py-2 text-[14px] font-bold transition hover:opacity-85"
                          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}>Atšaukti</button>
                        <button type="button" disabled={!deactAck || deactBusy} onClick={() => setAnketaActive(false)}
                          className="rounded-xl px-4 py-2 text-[14px] font-extrabold transition hover:opacity-90 disabled:opacity-50"
                          style={{ background: '#f43f5e', color: '#fff' }}>{deactBusy ? 'Vykdoma…' : 'Patvirtinti deaktyvavimą'}</button>
                      </div>
                    </div>
                  )
                ) : (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl p-4" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}>
                    <div className="text-[14.5px]" style={{ color: 'var(--text-muted)' }}>Anketa deaktyvuota. Profilis ir įrašai paslėpti nuo kitų.</div>
                    <button type="button" disabled={deactBusy} onClick={() => setAnketaActive(true)}
                      className="shrink-0 rounded-xl px-4 py-2 text-[14px] font-extrabold transition hover:opacity-90 disabled:opacity-60"
                      style={{ background: 'var(--accent-orange)', color: '#fff' }}>{deactBusy ? 'Vykdoma…' : 'Vėl aktyvuoti'}</button>
                  </div>
                )}
              </Card>

              <Card className="mt-4">
                <div className="flex flex-col sm:flex-row gap-3">
                  <Link href="/" className="flex-1 text-center rounded-xl py-2.5 text-[14px] font-bold transition hover:opacity-85" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}>← Pradžia</Link>
                  <button onClick={() => signOut({ callbackUrl: '/' })}
                    className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl py-2.5 text-[14px] font-bold transition hover:opacity-85"
                    style={{ background: 'rgba(244,63,94,0.10)', border: '1px solid rgba(244,63,94,0.30)', color: '#f43f5e' }}>
                    <IcLogout /> Atsijungti
                  </button>
                </div>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Bendri primityvai ───────────────────────────────────────────────────────
const fieldStyle: React.CSSProperties = { background: 'var(--card-bg)', border: '1px solid var(--border-default)', color: 'var(--text-primary)', fontFamily: "'Outfit', sans-serif" }

function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl p-5 sm:p-6 ${className || ''}`} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}>{children}</section>
}
function CardHead({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <div className="mb-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[17px] sm:text-[18px] font-black tracking-tight">{title}</h2>
        {right}
      </div>
      {sub && <p className="text-[14.5px] mt-1 leading-snug" style={{ color: 'var(--text-muted)' }}>{sub}</p>}
    </div>
  )
}
function Label({ children }: { children: ReactNode }) {
  return <span className="block text-[13px] font-extrabold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>{children}</span>
}
function Hint({ children }: { children: ReactNode }) {
  return <span className="block text-[13px] mt-1 truncate" style={{ color: 'var(--text-faint)' }}>{children}</span>
}
function Inp({ value, onChange, placeholder, maxLength }: { value: string; onChange: (v: string) => void; placeholder?: string; maxLength?: number }) {
  return <input className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={fieldStyle} value={value} maxLength={maxLength} placeholder={placeholder} onChange={e => onChange(e.target.value)} />
}
function ThemeOpt({ active, icon, label, onClick }: { active: boolean; icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="flex items-center gap-3 rounded-xl p-3.5 transition"
      style={{ background: active ? 'rgba(249,115,22,0.10)' : 'var(--bg-elevated)', border: `1px solid ${active ? 'var(--accent-orange)' : 'var(--border-default)'}` }}>
      <span className="flex h-9 w-9 items-center justify-center rounded-lg shrink-0" style={{ background: 'var(--card-bg)', color: active ? 'var(--accent-orange)' : 'var(--text-muted)' }}>{icon}</span>
      <span className="text-[14px] font-bold" style={{ color: active ? 'var(--accent-orange)' : 'var(--text-primary)' }}>{label}</span>
      {active && <IcCheck className="ml-auto h-4 w-4" />}
    </button>
  )
}

// ── Pranešimai ──────────────────────────────────────────────────────────────
type NotifType = { type: string; label: string; desc: string; group: 'reactions' | 'comments' | 'community' | 'system' }
const NOTIF_TYPES: NotifType[] = [
  { type: 'comment_reply', label: 'Atsakymai į komentarus', desc: 'Kai kažkas atsako į tavo paliktą komentarą', group: 'comments' },
  { type: 'entity_comment', label: 'Komentarai prie tavo turinio', desc: 'Kai kažkas pakomentuoja tavo paskelbtą įrašą ar nuotrauką', group: 'comments' },
  { type: 'blog_comment', label: 'Komentarai blog įrašuose', desc: 'Kai kažkas pakomentuoja tavo blog įrašą', group: 'comments' },
  { type: 'comment_like', label: 'Patiktukai komentaruose', desc: 'Kai kažkas pamėgsta tavo komentarą', group: 'reactions' },
  { type: 'blog_like', label: 'Patiktukai blog įrašuose', desc: 'Kai kažkas pamėgsta tavo blog įrašą', group: 'reactions' },
  { type: 'favorite_artist_track', label: 'Naujos dainos nuo mėgstamų atlikėjų', desc: 'Kai pasirodo nauja daina ar albumas nuo tavo pamėgto atlikėjo', group: 'community' },
  { type: 'daily_song_winner', label: 'Dienos dainos rezultatai', desc: 'Kai tavo nominuotas track\'as laimi dienos dainą', group: 'community' },
  { type: 'system', label: 'Sistemos pranešimai', desc: 'Svarbūs admin/redakcijos pranešimai', group: 'system' },
]
const GROUP_LABEL: Record<string, string> = { reactions: 'Patiktukai', comments: 'Komentarai', community: 'Bendruomenė ir muzika', system: 'Sistema' }

function NotificationsBody({ prefs, savingPref, toggleNotif, masterNotif, pushStatus, pushBusy, pushError, togglePush }: {
  prefs: Record<string, boolean>; savingPref: string | null; toggleNotif: (t: string) => void; masterNotif: (on: boolean) => void
  pushStatus: PushStatus | null; pushBusy: boolean; pushError: string | null; togglePush: () => void
}) {
  const grouped: Record<string, NotifType[]> = {}
  for (const t of NOTIF_TYPES) { (grouped[t.group] ||= []).push(t) }
  const allEnabled = NOTIF_TYPES.every(t => prefs[t.type] !== false)
  const anyEnabled = NOTIF_TYPES.some(t => prefs[t.type] !== false)

  return (
    <div className="flex flex-col gap-3.5">
      {pushStatus && pushStatus !== 'unsupported' && (
        <div className="rounded-xl p-4 flex items-center justify-between gap-4" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}>
          <div className="flex-1 min-w-0">
            <div className="text-[14px] font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              Push pranešimai naršyklėje
              {pushStatus === 'subscribed' && <span className="px-2 py-0.5 rounded-full text-[12px] font-extrabold uppercase tracking-wide" style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981' }}>Aktyvūs</span>}
            </div>
            <div className="text-[14px] mt-0.5 leading-snug" style={{ color: 'var(--text-muted)' }}>
              {pushStatus === 'subscribed' ? 'Naują pranešimą gausi tiesiai į naršyklę net kai music.lt nėra atviras.'
                : pushStatus === 'denied' ? 'Naršyklė atmetė leidimą. Atblokuok rankiniu būdu naršyklės nustatymuose, tada pakartok.'
                : pushStatus === 'not-configured' ? 'Push paslauga dar neaktyvuota svetainėje.'
                : 'Įjunk, kad gautum pranešimus net kai music.lt skirtukas uždarytas.'}
            </div>
            {pushError && <div className="text-[13px] mt-1" style={{ color: '#ef4444' }}>{pushError}</div>}
          </div>
          {(pushStatus === 'subscribed' || pushStatus === 'unsubscribed') && <Toggle checked={pushStatus === 'subscribed'} onChange={togglePush} disabled={pushBusy} size="lg" />}
        </div>
      )}

      <div className="rounded-xl p-4 flex items-center justify-between gap-4" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}>
        <div>
          <div className="text-[14px] font-bold" style={{ color: 'var(--text-primary)' }}>Visi pranešimai</div>
          <div className="text-[14px]" style={{ color: 'var(--text-muted)' }}>{allEnabled ? 'Įjungta — gauni visus pažymėtus žemiau.' : anyEnabled ? 'Iš dalies — kai kurie tipai išjungti.' : 'Išjungta — pranešimų negausi.'}</div>
        </div>
        <Toggle checked={allEnabled} onChange={() => masterNotif(!allEnabled)} disabled={savingPref === '__all'} size="lg" />
      </div>

      {(['reactions', 'comments', 'community', 'system'] as const).map(g => grouped[g] && (
        <div key={g}>
          <div className="text-[13px] font-extrabold uppercase tracking-wider mb-2 px-1" style={{ color: 'var(--text-muted)' }}>{GROUP_LABEL[g]}</div>
          <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}>
            {grouped[g].map((t, i) => (
              <div key={t.type} className="px-4 py-3.5 flex items-center justify-between gap-4" style={{ borderTop: i === 0 ? 'none' : '1px solid var(--border-subtle)' }}>
                <div className="flex-1 min-w-0">
                  <div className="text-[14.5px] font-semibold" style={{ color: 'var(--text-primary)' }}>{t.label}</div>
                  <div className="text-[14px] mt-0.5 leading-snug" style={{ color: 'var(--text-muted)' }}>{t.desc}</div>
                </div>
                <Toggle checked={prefs[t.type] !== false} onChange={() => toggleNotif(t.type)} disabled={savingPref === t.type} />
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="rounded-xl p-3.5 text-[14px] leading-snug" style={{ background: 'rgba(96,165,250,0.06)', border: '1px solid rgba(96,165,250,0.18)', color: 'var(--text-secondary)' }}>
        <strong>Pastaba:</strong> el. paštu pranešimų kol kas neišsiunčiame — viskas pasirodo svetainėje, varpelio ikonoje.
      </div>
    </div>
  )
}

function Toggle({ checked, onChange, disabled, size = 'md' }: { checked: boolean; onChange: () => void; disabled?: boolean; size?: 'md' | 'lg' }) {
  const w = size === 'lg' ? 48 : 40
  const h = size === 'lg' ? 28 : 24
  const knob = h - 6
  return (
    <button onClick={onChange} disabled={disabled} role="switch" aria-checked={checked}
      style={{ position: 'relative', flexShrink: 0, width: w, height: h, borderRadius: h / 2, border: '1px solid var(--border-default)', background: checked ? 'var(--accent-orange)' : 'var(--bg-hover)', cursor: disabled ? 'wait' : 'pointer', transition: 'background .18s ease', opacity: disabled ? 0.6 : 1, padding: 0 }}>
      <span style={{ position: 'absolute', top: 2, left: checked ? w - knob - 4 : 2, width: knob, height: knob, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.25)', transition: 'left .2s cubic-bezier(.4,0,.2,1)' }} />
    </button>
  )
}
