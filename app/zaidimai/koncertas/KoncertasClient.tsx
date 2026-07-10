'use client'

// app/zaidimai/koncertas/KoncertasClient.tsx
//
// „Dienos koncertas" — dienos atlikėjas, jo dainų setas (~10). Iš minios
// (apačioje) kyla švytintys ženklai link scenos — baksteli juos.
//   * ikonos turi skirtingą svorį (♪ ♫ ★ ♥) + retas 💎 boost'as
//   * du neigiami: ✕ (−gyvybė), 📵 (nutraukia seriją)
//   * populiari daina = „HITAS": greičiau + taškai ×2
//   * priedainis/drop (energija) irgi ×2
//   * tarp dainų — trumpa pauzė su padrąsinimu
//   * pritrūkus gyvybių — gali likti koncerte iki galo
//   * 3 gyvybės, 25 iš eilės → +1. Canvas 60fps, HTML5 audio.

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { proxyImg } from '@/lib/img-proxy'
import ZaidimoLangas from '@/components/zaidimai/ZaidimoLangas'

type Phase = 'loading' | 'ready' | 'play' | 'results' | 'error'
type Song = { title: string; url: string; pop: number }
type Kind = 'note' | 'heart' | 'star' | 'gem' | 'x' | 'mute'
type Icon = { x: number; y: number; vy: number; kind: Kind; color: string; born: number; resolved: boolean }
type OverInfo = { score: number; songNo: number; pctReached: number } | null

const MAX_LIVES = 5
const FRAME = 0.02
const HIT_POP = 0.9

// Paprasti taškai (1..5), be kosminių skaičių. Hitas/drop dvigubina.
const KIND_W: Record<Kind, number> = { note: 1, heart: 2, star: 3, gem: 5, x: 0, mute: 0 }
const GOOD_COLORS = ['#f59e0b', '#22d3ee', '#ec4899', '#a78bfa']

function buildEnvelope(buf: AudioBuffer): { env: Float32Array; frameT: number } {
  const ch = buf.getChannelData(0)
  const sr = buf.sampleRate
  const hop = Math.max(1, Math.round(sr * FRAME))
  const frameT = hop / sr
  const n = Math.floor(ch.length / hop)
  const raw = new Float32Array(n)
  let mx = 1e-6
  for (let i = 0; i < n; i++) {
    let s = 0
    for (let j = 0; j < hop; j++) { const v = ch[i * hop + j] || 0; s += v * v }
    raw[i] = Math.sqrt(s / hop)
    if (raw[i] > mx) mx = raw[i]
  }
  const env = new Float32Array(n)
  const win = 4
  for (let i = 0; i < n; i++) {
    let sum = 0, cnt = 0
    for (let k = Math.max(0, i - win); k <= Math.min(n - 1, i + win); k++) { sum += raw[k]; cnt++ }
    env[i] = Math.min(1, (sum / cnt) / mx)
  }
  return { env, frameT }
}

export default function KoncertasClient() {
  const [phase, setPhase] = useState<Phase>('loading')
  const [artist, setArtist] = useState<{ name: string; image: string } | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [songLabel, setSongLabel] = useState('')
  const [songNo, setSongNo] = useState(1)
  const [hitMode, setHitMode] = useState(false)
  const [over, setOver] = useState<OverInfo>(null)
  const [results, setResults] = useState<{ score: number; hype: number; missed: number; songsSurvived: number; best: number; scores: number[]; percentile: number } | null>(null)

  const setlistRef = useRef<Song[]>([])
  const songIdxRef = useRef(0)
  const popRef = useRef(0.5)
  const hitRef = useRef(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const artistImgRef = useRef<HTMLImageElement | null>(null)
  const envRef = useRef<Float32Array>(new Float32Array([0.5]))
  const frameTRef = useRef(FRAME)
  const decodeTokenRef = useRef(0)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rafRef = useRef(0)

  const iconsRef = useRef<Icon[]>([])
  const gtRef = useRef(0)
  const lastTsRef = useRef(0)
  const spawnAccRef = useRef(0)
  const scoreRef = useRef(0)
  const comboRef = useRef(0)
  const maxComboRef = useRef(0)
  const hypeRef = useRef(0)
  const songHypeRef = useRef(0)
  const songScoreRef = useRef<number[]>([])
  const interMsgRef = useRef('Kita daina')
  const missedRef = useRef(0)
  const previewRef = useRef<HTMLAudioElement | null>(null)
  const [playingIdx, setPlayingIdx] = useState<number>(-1)
  const livesRef = useRef(3)
  const lifeFlashRef = useRef(-9)
  const floatsRef = useRef<{ x: number; y: number; text: string; color: string; at: number }[]>([])
  const endedRef = useRef(false)
  const deadRef = useRef(false)
  const pausedRef = useRef(false)
  const pendingRef = useRef<number | null>(null)
  const pauseUntilRef = useRef(0)
  const interTitleRef = useRef('')

  useEffect(() => {
    const a = new Audio()
    a.preload = 'auto'; a.crossOrigin = 'anonymous'; a.loop = false
    a.addEventListener('ended', onSongEnded)
    audioRef.current = a
    void init()
    return () => { cancelAnimationFrame(rafRef.current); try { a.pause() } catch { /* ok */ }; try { previewRef.current?.pause() } catch { /* ok */ } }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function init(kitas = false) {
    setPhase('loading'); setErr(null); setOver(null)
    try { audioRef.current?.pause() } catch { /* ok */ }
    try {
      const res = await fetch('/api/zaidimai/koncertas' + (kitas ? '?kitas=1' : ''))
      const j = await res.json()
      if (!res.ok || !j.setlist?.length || !j.artist) { setErr(j.error || 'Nepavyko įkelti'); setPhase('error'); return }
      setlistRef.current = j.setlist
      setArtist(j.artist)
      const img = new Image()
      img.src = proxyImg(j.artist.image, 240)
      artistImgRef.current = img
      setPhase('ready')
    } catch { setErr('Tinklo klaida'); setPhase('error') }
  }

  async function decodeEnvelope(url: string, token: number) {
    try {
      const ab = await fetch(url).then(r => r.arrayBuffer())
      const AC = (window.AudioContext || (window as any).webkitAudioContext)
      const ctx = new AC()
      const buf = await ctx.decodeAudioData(ab.slice(0))
      const { env, frameT } = buildEnvelope(buf)
      try { await ctx.close() } catch { /* ok */ }
      if (decodeTokenRef.current === token) { envRef.current = env; frameTRef.current = frameT }
    } catch { /* liks sintetinė energija */ }
  }

  function playSong(i: number) {
    const s = setlistRef.current[i]
    const a = audioRef.current
    if (!s || !a) return
    const token = ++decodeTokenRef.current
    envRef.current = new Float32Array([0.5])
    popRef.current = typeof s.pop === 'number' ? s.pop : 0.5
    hitRef.current = popRef.current >= HIT_POP
    setHitMode(hitRef.current)
    songHypeRef.current = 0
    a.src = s.url
    try { a.currentTime = 0 } catch { /* ok */ }
    void a.play().catch(() => {})
    setSongLabel(s.title)
    setSongNo(i + 1)
    void decodeEnvelope(s.url, token)
  }

  function onSongEnded() {
    if (endedRef.current) return
    const next = songIdxRef.current + 1
    if (next >= setlistRef.current.length) { finish(); return }
    // tarp dainų — trumpa pauzė; padrąsinimas pagal tai, kaip sekėsi
    const sh = songHypeRef.current
    interMsgRef.current = sh >= 12 ? '🔥 Puiku!' : sh >= 5 ? '👏 Neblogai!' : 'Kita daina'
    pendingRef.current = next
    interTitleRef.current = setlistRef.current[next].title
    pauseUntilRef.current = gtRef.current + 1.9
    iconsRef.current = []
  }

  function energyNow(): number {
    const a = audioRef.current
    const env = envRef.current
    if (env.length <= 1) return 0.45 + 0.28 * Math.sin(gtRef.current * 2.4)
    const t = a ? a.currentTime : gtRef.current
    const f = t / frameTRef.current
    const i = Math.floor(f)
    const x = env[i] || 0, y = env[(i + 1) % env.length] || 0
    return x + (y - x) * (f - i)
  }

  function start() {
    iconsRef.current = []; floatsRef.current = []
    gtRef.current = 0; lastTsRef.current = 0; spawnAccRef.current = 0
    scoreRef.current = 0; comboRef.current = 0; maxComboRef.current = 0; hypeRef.current = 0; songHypeRef.current = 0; missedRef.current = 0
    songScoreRef.current = new Array(setlistRef.current.length).fill(0)
    try { previewRef.current?.pause() } catch { /* ok */ }; setPlayingIdx(-1)
    livesRef.current = 3; lifeFlashRef.current = -9; endedRef.current = false; deadRef.current = false; pausedRef.current = false
    pendingRef.current = null; pauseUntilRef.current = 0
    songIdxRef.current = 0
    setOver(null)
    playSong(0)
    setPhase('play')
  }

  function pickKind(): Kind {
    const r = Math.random()
    if (r < 0.03) return 'gem'
    if (r < 0.12) return 'x'
    if (r < 0.17) return 'mute'
    const g = Math.random()
    if (g < 0.20) return 'star'
    if (g < 0.48) return 'heart'
    return 'note'
  }

  function triggerDeath() {
    if (deadRef.current) return
    deadRef.current = true
    pausedRef.current = true
    try { audioRef.current?.pause() } catch { /* ok */ }
    const myNo = songIdxRef.current + 1
    setOver({ score: scoreRef.current, songNo: myNo, pctReached: -1 })
    void (async () => {
      try {
        const res = await fetch('/api/zaidimai/koncertas/rezultatai')
        const j = await res.json()
        const reached: number[] = Array.isArray(j?.songsReached) ? j.songsReached : []
        const pct = reached.length ? Math.round(reached.filter(s => s >= myNo).length / reached.length * 100) : 0
        setOver(o => o ? { ...o, pctReached: pct } : o)
      } catch { setOver(o => o ? { ...o, pctReached: -2 } : o) }
    })()
  }

  function playPreview(i: number) {
    const s = setlistRef.current[i]
    if (!s) return
    if (!previewRef.current) {
      const au = new Audio(); au.loop = false
      au.addEventListener('ended', () => setPlayingIdx(-1))
      previewRef.current = au
    }
    const au = previewRef.current
    if (playingIdx === i) { try { au.pause() } catch { /* ok */ }; setPlayingIdx(-1); return }
    au.src = s.url
    try { au.currentTime = 0 } catch { /* ok */ }
    void au.play().catch(() => {})
    setPlayingIdx(i)
  }

  function stayInConcert() {
    setOver(null)
    pausedRef.current = false
    lastTsRef.current = 0
    // tęsiam dabartinę dainą (spectator — be gyvybių, be baudų)
    void audioRef.current?.play().catch(() => {})
  }

  function finish() {
    endedRef.current = true
    cancelAnimationFrame(rafRef.current)
    try { audioRef.current?.pause() } catch { /* ok */ }
    setOver(null)
    const score = scoreRef.current
    const best = Math.max(score, Number(lsGet('koncertas_best') || 0))
    lsSet('koncertas_best', String(best))
    const hype = hypeRef.current, missed = missedRef.current
    const songsSurvived = Math.min(setlistRef.current.length, songIdxRef.current + 1)
    setResults({ score, hype, missed, songsSurvived, best, scores: [], percentile: -1 })
    setPhase('results')
    void (async () => {
      try {
        const res = await fetch('/api/zaidimai/koncertas/rezultatai', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ score, hype, missed, songs: songsSurvived, artist: artist?.name || '' }),
        })
        const j = await res.json()
        const scores: number[] = Array.isArray(j?.scores) ? j.scores.filter((n: any) => Number.isFinite(n)) : []
        const beat = scores.length ? scores.filter(s => score >= s).length / scores.length : 1
        setResults(r => r ? { ...r, scores, percentile: Math.round(beat * 100) } : r)
      } catch { setResults(r => r ? { ...r, percentile: -2 } : r) }
    })()
  }

  useEffect(() => {
    if (phase !== 'play') return
    setupCanvas()
    const onResize = () => setupCanvas()
    window.addEventListener('resize', onResize)
    rafRef.current = requestAnimationFrame(loop)
    return () => { cancelAnimationFrame(rafRef.current); window.removeEventListener('resize', onResize) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  function setupCanvas() {
    const c = canvasRef.current
    if (!c) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const rect = c.getBoundingClientRect()
    c.width = Math.round(rect.width * dpr); c.height = Math.round(rect.height * dpr)
    c.getContext('2d')!.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  function onPointerDown(e: React.PointerEvent) {
    if (pausedRef.current) return
    const c = canvasRef.current
    if (!c) return
    const rect = c.getBoundingClientRect()
    const px = e.clientX - rect.left, py = e.clientY - rect.top
    const gt = gtRef.current
    let bi = -1, bd = 1e9
    for (let i = 0; i < iconsRef.current.length; i++) {
      const it = iconsRef.current[i]
      if (it.resolved) continue
      const dx = px - it.x, dy = py - it.y
      const d = dx * dx + dy * dy
      if (d < 36 * 36 && d < bd) { bd = d; bi = i }
    }
    if (bi < 0) return
    const it = iconsRef.current[bi]
    it.resolved = true
    // spectator (be gyvybių) — ženklą pašalinam, bet taškai nedidėja
    if (deadRef.current) return
    const drop = energyNow() > 0.6
    const mult = Math.max(hitRef.current ? 2 : 1, drop ? 2 : 1)
    const good = it.kind !== 'x' && it.kind !== 'mute'
    if (good) {
      comboRef.current++; hypeRef.current++; songHypeRef.current++
      if (comboRef.current > maxComboRef.current) maxComboRef.current = comboRef.current
      const base = KIND_W[it.kind]
      const pts = base * mult   // paprasti taškai 1..5, hitas/drop ×2
      scoreRef.current += pts
      const si = songIdxRef.current
      if (songScoreRef.current[si] != null) songScoreRef.current[si] += pts
      const label = it.kind === 'gem' ? `💎 +${pts}` : `+${pts}`
      floatsRef.current.push({ x: it.x, y: it.y - 16, text: label, color: it.kind === 'gem' ? '#a78bfa' : (mult > 1 ? '#f59e0b' : '#22c55e'), at: gt })
      if (comboRef.current > 0 && comboRef.current % 25 === 0 && livesRef.current < MAX_LIVES) {
        livesRef.current++; lifeFlashRef.current = gt
        floatsRef.current.push({ x: it.x, y: it.y - 42, text: '+1 gyvybė ❤', color: '#22c55e', at: gt })
      }
    } else if (it.kind === 'mute') {
      comboRef.current = 0
      floatsRef.current.push({ x: it.x, y: it.y - 16, text: '−serija', color: '#f59e0b', at: gt })
    } else {
      comboRef.current = 0
      if (!deadRef.current) {
        livesRef.current--
        floatsRef.current.push({ x: it.x, y: it.y - 16, text: '−1 ❤', color: '#f87171', at: gt })
        if (livesRef.current <= 0) triggerDeath()
      }
    }
  }

  function loop(ts: number) {
    const c = canvasRef.current, a = audioRef.current
    if (!c) { rafRef.current = requestAnimationFrame(loop); return }
    const g = c.getContext('2d')!
    const w = c.clientWidth, h = c.clientHeight

    if (pausedRef.current) {
      // sustabdyta (game over kortelė) — piešiam paskutinį kadrą ramiai
      drawScene(g, w, h, 0.4, false, true)
      if (!endedRef.current) rafRef.current = requestAnimationFrame(loop)
      return
    }

    if (!lastTsRef.current) lastTsRef.current = ts
    let dt = (ts - lastTsRef.current) / 1000
    lastTsRef.current = ts
    if (dt > 0.05) dt = 0.05
    gtRef.current += dt
    const gt = gtRef.current

    // pauzė tarp dainų
    const inInter = pauseUntilRef.current > gt
    if (!inInter && pendingRef.current != null) {
      songIdxRef.current = pendingRef.current
      pendingRef.current = null
      playSong(songIdxRef.current)
    }

    const pop = popRef.current
    const energy = Math.max(0, Math.min(1, energyNow()))
    const drop = energy > 0.6
    const hit = hitRef.current
    const intensity = 0.30 + pop * 0.85
    const speedFactor = hit ? 1.2 : 1

    const stageLine = h * 0.32
    const crowdTop = h * 0.80

    if (!inInter) {
      const spawnEvery = Math.max(0.26, 1.25 - intensity * 0.5 - energy * 0.5)
      spawnAccRef.current += dt
      if (spawnAccRef.current >= spawnEvery) {
        spawnAccRef.current = 0
        const n = drop ? 2 : 1
        for (let k = 0; k < n; k++) {
          const kind = pickKind()
          const good = kind !== 'x' && kind !== 'mute'
          const x = w * (0.12 + Math.random() * 0.76)
          const vy = h * (0.135 + intensity * 0.075 + energy * 0.09) * speedFactor
          const gi = Math.floor(Math.random() * GOOD_COLORS.length)
          const color = kind === 'gem' ? '#c4b5fd' : good ? GOOD_COLORS[gi] : '#5b6577'
          iconsRef.current.push({ x, y: crowdTop, vy, kind, color, born: gt, resolved: false })
        }
      }
      // judesys + praleisti
      const keep: Icon[] = []
      for (const it of iconsRef.current) {
        if (it.resolved) continue
        it.y -= it.vy * dt
        if (it.y < stageLine) {
          const good = it.kind !== 'x' && it.kind !== 'mute'
          if (good && !deadRef.current) { comboRef.current = 0; missedRef.current++ }
          continue
        }
        keep.push(it)
      }
      iconsRef.current = keep
    }

    drawScene(g, w, h, energy, drop, false)

    // intermission padrąsinimas
    if (inInter) {
      g.fillStyle = 'rgba(5,7,12,0.55)'; g.fillRect(0, 0, w, h)
      g.textAlign = 'center'
      g.fillStyle = '#f59e0b'; g.font = '900 30px Outfit, system-ui, sans-serif'
      g.fillText(interMsgRef.current, w / 2, h * 0.42)
      g.fillStyle = '#e7ebf2'; g.font = '800 15px Outfit, system-ui, sans-serif'
      g.fillText('Kita daina:', w / 2, h * 0.50)
      g.fillStyle = '#22d3ee'; g.font = '900 18px Outfit, system-ui, sans-serif'
      const t = interTitleRef.current
      g.fillText(t.length > 26 ? t.slice(0, 25) + '…' : t, w / 2, h * 0.555)
      g.textAlign = 'left'
    }

    if (a && !endedRef.current) rafRef.current = requestAnimationFrame(loop)
  }

  function drawScene(g: CanvasRenderingContext2D, w: number, h: number, energy: number, drop: boolean, frozen: boolean) {
    const stageLine = h * 0.32
    const crowdTop = h * 0.80
    g.clearRect(0, 0, w, h)
    const bg = g.createLinearGradient(0, 0, 0, h)
    bg.addColorStop(0, `rgb(${12 + energy * 26},${12 + energy * 12},${26 + energy * 30})`)
    bg.addColorStop(0.55, '#0b1020')
    bg.addColorStop(1, '#05070c')
    g.fillStyle = bg; g.fillRect(0, 0, w, h)

    const beamA = 0.05 + energy * 0.18
    g.fillStyle = `rgba(249,158,11,${beamA})`
    g.beginPath(); g.moveTo(w * 0.32, 0); g.lineTo(w * 0.06, stageLine); g.lineTo(w * 0.26, stageLine); g.closePath(); g.fill()
    g.beginPath(); g.moveTo(w * 0.68, 0); g.lineTo(w * 0.94, stageLine); g.lineTo(w * 0.74, stageLine); g.closePath(); g.fill()

    // LED ekranas su atlikėju
    const ledW = Math.min(w * 0.56, 230), ledH = ledW * 0.5
    const ledX = w / 2 - ledW / 2, ledY = h * 0.15
    g.save()
    roundRectPath(g, ledX, ledY, ledW, ledH, 10); g.clip()
    const img = artistImgRef.current
    if (img && img.complete && img.naturalWidth > 0) {
      const ar = img.naturalWidth / img.naturalHeight, tr = ledW / ledH
      let dw = ledW, dh = ledH, ox = 0, oy = 0
      if (ar > tr) { dh = ledH; dw = dh * ar; ox = (ledW - dw) / 2 } else { dw = ledW; dh = dw / ar; oy = (ledH - dh) / 2 }
      g.drawImage(img, ledX + ox, ledY + oy, dw, dh)
    } else { g.fillStyle = '#1a1330'; g.fillRect(ledX, ledY, ledW, ledH) }
    g.restore()
    g.strokeStyle = `rgba(139,92,246,${0.45 + energy * 0.45})`; g.lineWidth = 2
    roundRectPath(g, ledX, ledY, ledW, ledH, 10); g.stroke()

    // scenos priekis
    const sg = g.createLinearGradient(0, stageLine - 10, 0, stageLine + 4)
    sg.addColorStop(0, 'rgba(249,158,11,0)'); sg.addColorStop(1, `rgba(249,158,11,${0.25 + energy * 0.3})`)
    g.fillStyle = sg; g.fillRect(0, stageLine - 10, w, 14)
    g.fillStyle = 'rgba(140,160,190,0.35)'; g.fillRect(0, stageLine, w, 2)

    // ikonos
    for (const it of iconsRef.current) {
      if (it.resolved) continue
      drawIcon(g, it)
    }

    // minia (apačioje, žemai — daug erdvės srautui)
    const cg = g.createLinearGradient(0, crowdTop - 6, 0, h)
    cg.addColorStop(0, 'rgba(6,9,15,0.5)'); cg.addColorStop(0.25, '#05070c'); cg.addColorStop(1, '#04060a')
    g.fillStyle = cg; g.fillRect(0, crowdTop - 6, w, h - crowdTop + 6)
    g.fillStyle = '#0e1421'
    const cols = Math.max(7, Math.round(w / 30))
    for (let row = 0; row < 2; row++) {
      const baseY = crowdTop + 12 + row * 16
      for (let i = 0; i <= cols; i++) {
        const hx = (w / cols) * i + (row % 2 ? w / cols / 2 : 0)
        g.beginPath(); g.arc(hx, baseY, 7, 0, Math.PI * 2); g.fill()
        g.beginPath(); roundRectPath(g, hx - 10, baseY + 4, 20, h - baseY, 8); g.fill()
      }
    }
    const lights = Math.round(2 + energy * 6)
    for (let i = 0; i < lights; i++) {
      const lx = ((i * 61 + 13) % 100) / 100 * w
      const ly = crowdTop + 2 + ((i * 29) % 8)
      g.strokeStyle = 'rgba(120,130,150,0.4)'; g.lineWidth = 1.5
      g.beginPath(); g.moveTo(lx, ly + 12); g.lineTo(lx, ly); g.stroke()
      const col = GOOD_COLORS[i % GOOD_COLORS.length]
      const gr = g.createRadialGradient(lx, ly, 0, lx, ly, 7)
      gr.addColorStop(0, col); gr.addColorStop(1, hexA(col, 0))
      g.fillStyle = gr; g.globalAlpha = 0.6 + energy * 0.4
      g.beginPath(); g.arc(lx, ly, 6, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1
    }

    if (drop) { g.strokeStyle = 'rgba(249,115,22,0.5)'; g.lineWidth = 3; roundRectPath(g, 3, 3, w - 6, h - 6, 20); g.stroke() }

    // floats
    const gt = gtRef.current
    const nf: typeof floatsRef.current = []
    for (const f of floatsRef.current) {
      const age = gt - f.at
      if (age > 0.8) continue
      g.globalAlpha = Math.max(0, 1 - age / 0.8)
      g.fillStyle = f.color; g.font = '900 16px Outfit, system-ui, sans-serif'; g.textAlign = 'center'
      g.fillText(f.text, f.x, f.y - age * 34); g.globalAlpha = 1
      nf.push(f)
    }
    if (!frozen) floatsRef.current = nf

    // HUD — po viršutine juosta (kad nelįstų ant pavadinimo)
    g.textAlign = 'left'; g.textBaseline = 'alphabetic'
    g.fillStyle = '#e7ebf2'; g.font = '900 20px Outfit, system-ui, sans-serif'
    g.fillText(`${scoreRef.current}`, 14, 52)
    if (comboRef.current >= 2) { g.fillStyle = '#f59e0b'; g.font = '900 12px Outfit, system-ui, sans-serif'; g.fillText(`serija ×${comboRef.current}`, 14, 70) }
    g.textAlign = 'right'; g.font = '900 17px Outfit, system-ui, sans-serif'; g.fillStyle = '#f87171'
    g.fillText(deadRef.current ? '🎶' : '❤'.repeat(Math.max(0, livesRef.current)), w - 12, 52)

    const gage = gt - lifeFlashRef.current
    if (gage >= 0 && gage < 1) {
      g.globalAlpha = Math.max(0, (1 - gage) * 0.5)
      const gr = g.createLinearGradient(0, 0, 0, 70); gr.addColorStop(0, 'rgba(34,197,94,0.9)'); gr.addColorStop(1, 'rgba(34,197,94,0)')
      g.fillStyle = gr; g.fillRect(0, 0, w, 70); g.globalAlpha = 1
    }
  }

  function drawIcon(g: CanvasRenderingContext2D, it: Icon) {
    const x = it.x, y = it.y
    if (it.kind === 'x') {
      g.fillStyle = 'rgba(70,80,98,0.9)'; g.beginPath(); g.arc(x, y, 13, 0, Math.PI * 2); g.fill()
      g.strokeStyle = 'rgba(210,220,235,0.6)'; g.lineWidth = 2.5
      g.beginPath(); g.moveTo(x - 5, y - 5); g.lineTo(x + 5, y + 5); g.moveTo(x + 5, y - 5); g.lineTo(x - 5, y + 5); g.stroke()
      return
    }
    if (it.kind === 'mute') {
      g.fillStyle = 'rgba(70,80,98,0.9)'; roundRectPath(g, x - 9, y - 13, 18, 26, 4); g.fill()
      g.strokeStyle = 'rgba(210,220,235,0.55)'; g.lineWidth = 2
      g.beginPath(); g.moveTo(x - 9, y + 13); g.lineTo(x + 9, y - 13); g.stroke()
      return
    }
    // švytintis fonas
    const R = it.kind === 'gem' ? 16 : it.kind === 'star' ? 15 : 14
    const grd = g.createRadialGradient(x, y, 1, x, y, R + 10)
    grd.addColorStop(0, it.color); grd.addColorStop(1, hexA(it.color, 0))
    g.fillStyle = grd; g.beginPath(); g.arc(x, y, R + 10, 0, Math.PI * 2); g.fill()
    if (it.kind === 'note') {
      // moderni švytinti sfera (koncerto šviesa)
      const s = g.createRadialGradient(x - R * 0.35, y - R * 0.35, 1, x, y, R)
      s.addColorStop(0, '#ffffff'); s.addColorStop(0.35, it.color); s.addColorStop(1, hexA(it.color, 0.85))
      g.fillStyle = s; g.beginPath(); g.arc(x, y, R, 0, Math.PI * 2); g.fill()
      g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.arc(x - R * 0.32, y - R * 0.32, R * 0.22, 0, Math.PI * 2); g.fill()
    } else if (it.kind === 'heart') {
      drawHeart(g, x, y, R, it.color)
    } else if (it.kind === 'star') {
      drawStar(g, x, y, R, R * 0.45, '#fde68a')
    } else if (it.kind === 'gem') {
      drawGem(g, x, y, R)
    }
  }

  const setlistLen = setlistRef.current.length

  return (
    <ZaidimoLangas title="Dienos koncertas" backHref="/zaidimai/testai" maxWidth={560}>
      <style>{css}</style>

      {phase === 'loading' && <div className="kc-center"><div className="kc-spinner" /><p className="kc-note">{artist ? `Ruošiam ${artist.name} koncertą…` : 'Renkam atlikėją…'}</p></div>}
      {phase === 'error' && <div className="kc-center"><div className="kc-error">{err}</div><button className="kc-cta" onClick={() => void init()}>Bandyti dar</button></div>}

      {phase === 'ready' && artist && (
        <div className="kc-ready">
          <div className="kc-badge">DIENOS KONCERTAS</div>
          <div className="kc-artwrap"><img className="kc-art" src={proxyImg(artist.image, 240)} alt={artist.name} /></div>
          <h1 className="kc-h1">{artist.name}</h1>
          <p className="kc-lead">Šiandien scenoje — <b>{artist.name}</b>. <b>{setlistLen} dainų setas</b>, finale — didžiausias hitas. Iš minios kyla <b>švytintys ženklai</b> — baksteli juos (šviesos, širdukai, žvaigždės), o retas <b>💎</b> duoda daugiau taškų. Venk <b>pilkų</b>: ✕ atima gyvybę, 📵 nutraukia seriją. Populiari daina = <b>HITAS</b>: greičiau, bet taškai <b>×2</b>. 3 gyvybės.</p>
          <button className="kc-cta big" onClick={start}>▶ Į koncertą</button>
          <button className="kc-cta ghost sm" onClick={() => void init(true)}>🔀 Kitas atlikėjas</button>
          <p className="kc-tiny">🔊 Įsijunk garsą — dainos valdo minią.</p>
        </div>
      )}

      {phase === 'play' && (
        <div className="kc-stage" onPointerDown={onPointerDown}>
          <div className="kc-topbar">🎤 {songNo}/{setlistLen} · {songLabel.length > 22 ? songLabel.slice(0, 21) + '…' : songLabel}{hitMode ? '  🔥×2' : ''}</div>
          <canvas ref={canvasRef} className="kc-canvas" />
          {over && (
            <div className="kc-over">
              <div className="kc-over-card">
                <div className="kc-over-t">💔 Gyvybės baigėsi</div>
                <div className="kc-over-score">{over.score}</div>
                <div className="kc-over-sub">
                  {over.pctReached === -1 ? 'skaičiuojam…'
                    : over.pctReached === -2 ? `nuėjai iki ${over.songNo} dainos`
                    : `nuėjai iki ${over.songNo} dainos · toliau nei ${over.pctReached}% žaidėjų`}
                </div>
                <div className="kc-over-btns">
                  <button className="kc-cta" onClick={stayInConcert}>🎶 Likti koncerte</button>
                  <button className="kc-cta ghost" onClick={finish}>Baigti</button>
                </div>
                <div className="kc-over-note">„Likti koncerte" — pasilieki iki galo, be gyvybių, tiesiog pasimėgauti.</div>
              </div>
            </div>
          )}
        </div>
      )}

      {phase === 'results' && results && (
        <div className="kc-ready">
          <div className="kc-badge">KONCERTAS BAIGTAS</div>
          <div className="kc-score">{results.score}</div>
          <p className="kc-lead">Išbuvai iki <b>{results.songsSurvived}</b>/{setlistLen} dainos {artist ? <>· <b>{artist.name}</b></> : null}</p>
          <div className="kc-stats">
            <span className="kc-stat s-ok"><b>{results.hype}</b>hype</span>
            <span className="kc-stat s-warn"><b>{results.missed}</b>praleista</span>
            <span className="kc-stat s-star"><b>{results.best}</b>rekordas</span>
          </div>
          <ScoreDistribution scores={results.scores} score={results.score} percentile={results.percentile} />
          <div className="kc-songs">
            <div className="kc-songs-h">Koncerto dainos · bakstelk pasiklausyti 🎧</div>
            {setlistRef.current.map((s, i) => (
              <button key={i} className={'kc-song' + (playingIdx === i ? ' on' : '')} onClick={() => playPreview(i)}>
                <span className="kc-song-play">{playingIdx === i ? '⏸' : '▶'}</span>
                <span className="kc-song-n">{i + 1}</span>
                <span className="kc-song-t">{s.title}</span>
                <span className="kc-song-pts">{songScoreRef.current[i] ?? 0}</span>
              </button>
            ))}
          </div>
          <div className="kc-actions">
            <button className="kc-cta" onClick={start}>Dar kartą</button>
            <button className="kc-cta ghost" onClick={() => void init(true)}>🔀 Kitas atlikėjas</button>
          </div>
          <Link href="/zaidimai/testai" className="kc-back">← Į testavimą</Link>
        </div>
      )}
    </ZaidimoLangas>
  )
}

function ScoreDistribution({ scores, score, percentile }: { scores: number[]; score: number; percentile: number }) {
  if (percentile === -1) return <div className="kc-dist kc-dist-note">Skaičiuojam, kaip pasirodei…</div>
  if (percentile === -2) return <div className="kc-dist kc-dist-note">Rezultatų lentos įkelti nepavyko</div>
  if (!scores.length) return <div className="kc-dist kc-dist-note">🎉 Tavo rezultatas — pirmasis lentoje!</div>
  const bins = 14
  const max = Math.max(score, ...scores, 1)
  const counts = new Array(bins).fill(0)
  for (const s of scores) { const i = Math.min(bins - 1, Math.floor((s / max) * bins)); counts[i]++ }
  const myBin = Math.min(bins - 1, Math.floor((score / max) * bins))
  const maxC = Math.max(...counts, 1)
  return (
    <div className="kc-dist">
      <div className="kc-dist-title">Paskutiniai 100 geriausių · <b>lenki {percentile}%</b></div>
      <div className="kc-bars">
        {counts.map((c, i) => (<div key={i} className={'kc-bar' + (i === myBin ? ' me' : '')} style={{ height: `${8 + (c / maxC) * 46}px` }} />))}
      </div>
      <div className="kc-dist-legend"><span className="me-dot" /> tavo rezultatas ({score})</div>
    </div>
  )
}

function roundRectPath(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath(); g.moveTo(x + r, y)
  g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r)
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath()
}
function drawStar(g: CanvasRenderingContext2D, cx: number, cy: number, outer: number, inner: number, color: string) {
  g.beginPath()
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner
    const ang = -Math.PI / 2 + i * Math.PI / 5
    const px = cx + Math.cos(ang) * r, py = cy + Math.sin(ang) * r
    i === 0 ? g.moveTo(px, py) : g.lineTo(px, py)
  }
  g.closePath()
  g.fillStyle = color; g.fill()
  g.strokeStyle = '#f59e0b'; g.lineWidth = 1.5; g.stroke()
}
function drawHeart(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) {
  const s = r / 14
  g.save(); g.translate(cx, cy + r * 0.15); g.scale(s, s)
  g.beginPath()
  g.moveTo(0, 4)
  g.bezierCurveTo(-1, 1, -6, -1, -9, -3)
  g.bezierCurveTo(-14, -7, -12, -14, -6, -14)
  g.bezierCurveTo(-2, -14, 0, -10, 0, -8)
  g.bezierCurveTo(0, -10, 2, -14, 6, -14)
  g.bezierCurveTo(12, -14, 14, -7, 9, -3)
  g.bezierCurveTo(6, -1, 1, 1, 0, 4)
  g.closePath()
  g.fillStyle = color; g.fill()
  g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 1.2; g.stroke()
  g.restore()
}
function drawGem(g: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  const grd = g.createLinearGradient(cx, cy - r, cx, cy + r)
  grd.addColorStop(0, '#e9d5ff'); grd.addColorStop(0.5, '#a78bfa'); grd.addColorStop(1, '#7c3aed')
  g.beginPath()
  g.moveTo(cx, cy - r); g.lineTo(cx + r * 0.8, cy); g.lineTo(cx, cy + r); g.lineTo(cx - r * 0.8, cy); g.closePath()
  g.fillStyle = grd; g.fill()
  g.strokeStyle = '#f5f3ff'; g.lineWidth = 1.5; g.stroke()
  g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 1
  g.beginPath(); g.moveTo(cx - r * 0.8, cy); g.lineTo(cx + r * 0.8, cy); g.stroke()
}
function hexA(hex: string, a: number): string {
  const m = hex.replace('#', '')
  const r = parseInt(m.slice(0, 2), 16), gg = parseInt(m.slice(2, 4), 16), b = parseInt(m.slice(4, 6), 16)
  return `rgba(${r},${gg},${b},${a})`
}
function lsGet(k: string): string | null { try { return window.localStorage.getItem(k) } catch { return null } }
function lsSet(k: string, v: string) { try { window.localStorage.setItem(k, v) } catch { /* ok */ } }

const css = `
.kc-center { display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 80px 0; }
.kc-spinner { width: 40px; height: 40px; border-radius: 50%; border: 3px solid rgba(148,163,184,0.25); border-top-color: var(--accent-orange); animation: kcspin .8s linear infinite; }
@keyframes kcspin { to { transform: rotate(360deg); } }
.kc-note { font-size: 13px; color: var(--text-muted); }
.kc-error { font-size: 14px; color: var(--accent-red); background: rgba(248,113,113,0.1); border-radius: 10px; padding: 10px 14px; }
.kc-ready { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 20px 0; }
.kc-badge { font-size: 11px; font-weight: 900; letter-spacing: 0.1em; color: var(--accent-orange); }
.kc-artwrap { width: 128px; height: 128px; border-radius: 18px; overflow: hidden; margin: 12px 0 8px; border: 1px solid rgba(140,160,190,0.25); box-shadow: 0 10px 30px rgba(0,0,0,0.4); }
.kc-art { width: 100%; height: 100%; object-fit: cover; display: block; }
.kc-h1 { font-size: 26px; font-weight: 900; letter-spacing: -0.02em; margin: 4px 0 12px; color: var(--text-primary); }
.kc-lead { font-size: 14px; color: var(--text-secondary); line-height: 1.6; max-width: 380px; margin: 0 0 16px; }
.kc-lead b { color: var(--text-primary); }
.kc-score { font-size: 60px; font-weight: 900; color: var(--accent-orange); line-height: 1; margin: 6px 0; }
.kc-stats { display: flex; gap: 10px; justify-content: center; margin: 4px 0 16px; }
.kc-stat { display: flex; flex-direction: column; align-items: center; font-size: 11px; color: var(--text-muted); font-weight: 700; min-width: 66px; padding: 9px 6px; background: var(--bg-surface); border: 1px solid rgba(140,160,190,0.18); border-radius: 12px; }
.kc-stat b { font-size: 20px; font-weight: 900; line-height: 1; margin-bottom: 3px; }
.kc-stat.s-ok b { color: #22c55e; }
.kc-stat.s-warn b { color: #f59e0b; }
.kc-stat.s-star b { color: var(--accent-orange); }
.kc-cta { font-size: 16px; font-weight: 800; color: #fff; cursor: pointer; border: 0; border-radius: 999px; padding: 13px 28px; background: var(--accent-orange); }
.kc-cta.big { font-size: 19px; padding: 16px 42px; }
.kc-cta.sm { margin-top: 10px; padding: 10px 20px; font-size: 14px; }
.kc-cta.ghost { background: var(--bg-surface); color: var(--text-primary); border: 1px solid rgba(140,160,190,0.3); }
.kc-actions { display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; margin-bottom: 12px; }
.kc-tiny { font-size: 12px; color: var(--text-muted); margin: 12px 0 0; }
.kc-back { font-size: 14px; color: var(--text-secondary); text-decoration: none; }
.kc-dist { width: 100%; max-width: 340px; margin: 2px 0 18px; }
.kc-dist-note { font-size: 12.5px; color: var(--text-muted); text-align: center; padding: 14px 0; }
.kc-dist-title { font-size: 12.5px; color: var(--text-secondary); text-align: center; margin-bottom: 8px; }
.kc-dist-title b { color: var(--accent-orange); }
.kc-bars { display: flex; align-items: flex-end; gap: 3px; height: 56px; padding: 0 4px; }
.kc-bar { flex: 1; background: rgba(148,163,184,0.32); border-radius: 3px 3px 0 0; min-height: 8px; }
.kc-bar.me { background: var(--accent-orange); box-shadow: 0 0 10px rgba(249,115,22,0.6); }
.kc-dist-legend { font-size: 11px; color: var(--text-muted); text-align: center; margin-top: 7px; display: flex; align-items: center; justify-content: center; gap: 6px; }
.me-dot { width: 9px; height: 9px; border-radius: 2px; background: var(--accent-orange); display: inline-block; }
.kc-songs { width: 100%; max-width: 360px; margin: 2px 0 18px; }
.kc-songs-h { font-size: 12.5px; color: var(--text-secondary); text-align: center; margin-bottom: 8px; }
.kc-song { display: flex; align-items: center; gap: 10px; width: 100%; text-align: left; background: var(--bg-surface); border: 1px solid rgba(140,160,190,0.18); border-radius: 10px; padding: 9px 12px; margin-bottom: 6px; cursor: pointer; color: var(--text-primary); }
.kc-song.on { border-color: var(--accent-orange); background: rgba(249,115,22,0.1); }
.kc-song-play { font-size: 12px; color: var(--accent-orange); width: 14px; }
.kc-song-n { font-size: 11px; font-weight: 900; color: var(--text-muted); width: 16px; }
.kc-song-t { flex: 1; font-size: 13px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.kc-song-pts { font-size: 13px; font-weight: 900; color: var(--accent-orange); }
.kc-stage { position: relative; width: 100%; height: 84vh; touch-action: none; user-select: none; cursor: pointer; }
.kc-canvas { width: 100%; height: 100%; display: block; }
.kc-topbar { position: absolute; top: 8px; left: 50%; transform: translateX(-50%); z-index: 3; max-width: 62%; font-size: 11px; font-weight: 800; color: #cbd5e1; background: rgba(11,15,24,0.7); border: 1px solid rgba(140,160,190,0.2); border-radius: 999px; padding: 4px 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; pointer-events: none; }
.kc-hint { position: absolute; bottom: 10px; left: 0; right: 0; text-align: center; font-size: 12px; color: rgba(231,235,242,0.7); pointer-events: none; }
.kc-over { position: absolute; inset: 0; z-index: 5; display: flex; align-items: center; justify-content: center; background: rgba(5,7,12,0.55); }
.kc-over-card { background: var(--bg-surface, #1e2430); border: 1px solid rgba(140,160,190,0.25); border-radius: 20px; padding: 22px 24px; text-align: center; max-width: 300px; box-shadow: 0 20px 50px rgba(0,0,0,0.5); }
.kc-over-t { font-size: 15px; font-weight: 900; color: var(--text-primary, #e7ebf2); }
.kc-over-score { font-size: 44px; font-weight: 900; color: var(--accent-orange); line-height: 1.1; margin: 6px 0; }
.kc-over-sub { font-size: 12.5px; color: var(--text-secondary, #cbd5e1); margin-bottom: 16px; line-height: 1.4; }
.kc-over-btns { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }
.kc-over-note { font-size: 11px; color: var(--text-muted, #8ea0b8); margin-top: 12px; line-height: 1.4; }
`
