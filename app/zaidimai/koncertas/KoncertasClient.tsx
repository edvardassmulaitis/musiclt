'use client'

// app/zaidimai/koncertas/KoncertasClient.tsx
//
// „Dienos koncertas" — vienas dienos atlikėjas, jo dainų setas (~10) sukamas
// viena po kitos. Iš minios kyla hype ženklai (🙌❤️✨) — baksteli juos.
// Dainos energija valdo, kiek hype kyla; link finalo (didžiausi hitai) —
// vis daugiau. 📵 nespaudi. 3 gyvybės. Canvas 60fps, HTML5 audio (iOS).

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { proxyImg } from '@/lib/img-proxy'
import ZaidimoLangas from '@/components/zaidimai/ZaidimoLangas'

type Phase = 'loading' | 'ready' | 'play' | 'results' | 'error'
type Song = { title: string; url: string }
type Icon = { x: number; y: number; vy: number; emoji: string; good: boolean; born: number; resolved: boolean }

const GOOD = ['🙌', '❤️', '✨', '🔥', '🎉', '🤟']
const BAD = ['📵']
const MAX_LIVES = 5
const FRAME = 0.02

function buildEnvelope(buf: AudioBuffer): { env: Float32Array; frameT: number; dur: number } {
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
  return { env, frameT, dur: buf.duration }
}

export default function KoncertasClient() {
  const [phase, setPhase] = useState<Phase>('loading')
  const [artist, setArtist] = useState<{ name: string; image: string } | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [songLabel, setSongLabel] = useState('')
  const [songNo, setSongNo] = useState(1)
  const [results, setResults] = useState<{ score: number; hype: number; missed: number; songsSurvived: number; best: number; scores: number[]; percentile: number } | null>(null)

  const setlistRef = useRef<Song[]>([])
  const songIdxRef = useRef(0)
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
  const hypeRef = useRef(0)       // pagautų hype skaičius
  const missedRef = useRef(0)
  const livesRef = useRef(3)
  const lifeFlashRef = useRef(-9)
  const floatsRef = useRef<{ x: number; y: number; text: string; color: string; at: number }[]>([])
  const endedRef = useRef(false)

  useEffect(() => {
    const a = new Audio()
    a.preload = 'auto'; a.crossOrigin = 'anonymous'; a.loop = false
    a.addEventListener('ended', onSongEnded)
    audioRef.current = a
    void init()
    return () => { cancelAnimationFrame(rafRef.current); try { a.pause() } catch { /* ok */ } }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function init() {
    setPhase('loading'); setErr(null)
    try {
      const res = await fetch('/api/zaidimai/koncertas')
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
    const list = setlistRef.current
    const s = list[i]
    const a = audioRef.current
    if (!s || !a) return
    const token = ++decodeTokenRef.current
    envRef.current = new Float32Array([0.5])   // kol dekoduojam — vidutinė
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
    if (next >= setlistRef.current.length) { finish(true); return }
    songIdxRef.current = next
    playSong(next)
  }

  function energyNow(): number {
    const a = audioRef.current
    const env = envRef.current
    if (env.length <= 1) return 0.42 + 0.18 * Math.sin(gtRef.current * 3)   // sintetinė kol nedekoduota
    const t = a ? a.currentTime : gtRef.current
    const f = t / frameTRef.current
    const i = Math.floor(f)
    const x = env[i] || 0, y = env[(i + 1) % env.length] || 0
    return x + (y - x) * (f - i)
  }

  function start() {
    iconsRef.current = []; floatsRef.current = []
    gtRef.current = 0; lastTsRef.current = 0; spawnAccRef.current = 0
    scoreRef.current = 0; comboRef.current = 0; maxComboRef.current = 0; hypeRef.current = 0; missedRef.current = 0
    livesRef.current = 3; lifeFlashRef.current = -9; endedRef.current = false
    songIdxRef.current = 0
    playSong(0)
    setPhase('play')
  }

  function finish(_survivedAll: boolean) {
    endedRef.current = true
    cancelAnimationFrame(rafRef.current)
    try { audioRef.current?.pause() } catch { /* ok */ }
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
      if (d < 34 * 34 && d < bd) { bd = d; bi = i }
    }
    if (bi < 0) return
    const it = iconsRef.current[bi]
    it.resolved = true
    const drop = energyNow() > 0.66
    if (it.good) {
      comboRef.current++; hypeRef.current++
      if (comboRef.current > maxComboRef.current) maxComboRef.current = comboRef.current
      const pts = Math.round(12 * (1 + Math.min(comboRef.current, 25) * 0.04) * (drop ? 2 : 1))
      scoreRef.current += pts
      floatsRef.current.push({ x: it.x, y: it.y - 14, text: `+${pts}`, color: drop ? '#f59e0b' : '#22c55e', at: gt })
      if (comboRef.current > 0 && comboRef.current % 25 === 0 && livesRef.current < MAX_LIVES) {
        livesRef.current++; lifeFlashRef.current = gt
        floatsRef.current.push({ x: it.x, y: it.y - 40, text: '+1 gyvybė ❤', color: '#22c55e', at: gt })
      }
    } else {
      livesRef.current--; comboRef.current = 0
      floatsRef.current.push({ x: it.x, y: it.y - 14, text: '📵 −1', color: '#f87171', at: gt })
      if (livesRef.current <= 0) { finish(false) }
    }
  }

  function loop(ts: number) {
    const c = canvasRef.current, a = audioRef.current
    if (!c) { rafRef.current = requestAnimationFrame(loop); return }
    const g = c.getContext('2d')!
    const w = c.clientWidth, h = c.clientHeight
    if (!lastTsRef.current) lastTsRef.current = ts
    let dt = (ts - lastTsRef.current) / 1000
    lastTsRef.current = ts
    if (dt > 0.05) dt = 0.05
    gtRef.current += dt
    const gt = gtRef.current

    const len = setlistRef.current.length || 1
    const songProgress = songIdxRef.current / Math.max(1, len - 1)     // 0..1 link finalo
    const energy = Math.max(0, Math.min(1, energyNow()))
    const drop = energy > 0.66
    const intensity = 0.5 + songProgress * 0.9                          // finale intensyviau

    // spawn — daugiau hype su energija ir link finalo
    const spawnEvery = Math.max(0.16, 0.9 - intensity * 0.28 - energy * 0.34)
    spawnAccRef.current += dt
    if (spawnAccRef.current >= spawnEvery) {
      spawnAccRef.current = 0
      const n = drop ? 2 : 1
      for (let k = 0; k < n; k++) {
        const good = Math.random() > 0.12    // ~12% blogų (📵), pastoviai
        const emoji = good ? GOOD[Math.floor(Math.random() * GOOD.length)] : BAD[0]
        const x = w * (0.12 + Math.random() * 0.76)
        const vy = h * (0.24 + intensity * 0.16 + energy * 0.14)   // px/s aukštyn
        iconsRef.current.push({ x, y: h * 0.72, vy, emoji, good, born: gt, resolved: false })
      }
    }

    // judesys + praleisti
    const topZone = h * 0.30
    const keep: Icon[] = []
    for (const it of iconsRef.current) {
      if (!it.resolved) {
        it.y -= it.vy * dt
        if (it.y < topZone) {
          it.resolved = true
          if (it.good) { comboRef.current = 0; missedRef.current++ }   // praleidai — tik serija (nebaudžia gyvybe)
          continue
        }
      } else {
        continue
      }
      keep.push(it)
    }
    iconsRef.current = keep
    if (livesRef.current <= 0 && !endedRef.current) { finish(false); return }

    // ── piešimas ──
    g.clearRect(0, 0, w, h)
    // dangus / salė — įsidega su energija
    const bg = g.createLinearGradient(0, 0, 0, h)
    bg.addColorStop(0, `rgb(${10 + energy * 26},${12 + energy * 12},${24 + energy * 30})`)
    bg.addColorStop(0.6, '#0c1120')
    bg.addColorStop(1, '#05070c')
    g.fillStyle = bg; g.fillRect(0, 0, w, h)

    // prožektorių spinduliai
    const beamA = 0.06 + energy * 0.16
    g.fillStyle = `rgba(249,158,11,${beamA})`
    g.beginPath(); g.moveTo(w * 0.30, h * 0.16); g.lineTo(w * 0.05, h * 0.72); g.lineTo(w * 0.22, h * 0.72); g.closePath(); g.fill()
    g.beginPath(); g.moveTo(w * 0.70, h * 0.16); g.lineTo(w * 0.95, h * 0.72); g.lineTo(w * 0.78, h * 0.72); g.closePath(); g.fill()

    // LED ekranas su atlikėjo nuotrauka + daina
    const ledW = Math.min(w * 0.52, 230), ledH = ledW * 0.56
    const ledX = w / 2 - ledW / 2, ledY = h * 0.075
    g.save()
    g.beginPath(); roundRectPath(g, ledX, ledY, ledW, ledH, 10); g.clip()
    const img = artistImgRef.current
    if (img && img.complete && img.naturalWidth > 0) {
      // cover
      const ar = img.naturalWidth / img.naturalHeight, tr = ledW / ledH
      let dw = ledW, dh = ledH, ox = 0, oy = 0
      if (ar > tr) { dh = ledH; dw = dh * ar; ox = (ledW - dw) / 2 } else { dw = ledW; dh = dw / ar; oy = (ledH - dh) / 2 }
      g.drawImage(img, ledX + ox, ledY + oy, dw, dh)
    } else { g.fillStyle = '#1a1330'; g.fillRect(ledX, ledY, ledW, ledH) }
    // titulinė juosta
    g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(ledX, ledY + ledH - 18, ledW, 18)
    g.restore()
    g.strokeStyle = `rgba(139,92,246,${0.5 + energy * 0.4})`; g.lineWidth = 2
    roundRectPath(g, ledX, ledY, ledW, ledH, 10); g.stroke()

    // scena
    g.fillStyle = '#141a2b'; g.fillRect(0, h * 0.70, w, h * 0.06)
    g.fillStyle = 'rgba(140,160,190,0.25)'; g.fillRect(0, h * 0.70, w, 1.5)
    // atlikėjo siluetas ant scenos
    g.fillStyle = '#0b0f18'; g.strokeStyle = `rgba(249,115,22,${0.5 + energy * 0.4})`; g.lineWidth = 1.5
    const axc = w / 2
    g.beginPath(); roundRectPath(g, axc - 7, h * 0.615, 14, h * 0.085, 6); g.fill(); g.stroke()
    g.beginPath(); g.arc(axc, h * 0.605, 7, 0, Math.PI * 2); g.fill(); g.stroke()

    // minia + telefonų šviesos (ryškėja su energija)
    g.fillStyle = '#0a0e18'; g.fillRect(0, h * 0.76, w, h * 0.24)
    const heads = 14
    for (let i = 0; i < heads; i++) {
      const hx = (w / heads) * (i + 0.5)
      g.fillStyle = '#131a2b'
      g.beginPath(); g.arc(hx, h * 0.80 + (i % 2) * 6, 7, 0, Math.PI * 2); g.fill()
      g.beginPath(); roundRectPath(g, hx - 8, h * 0.82 + (i % 2) * 6, 16, h * 0.12, 6); g.fill()
    }
    // šviesos taškai
    const lights = Math.round(4 + energy * 12)
    for (let i = 0; i < lights; i++) {
      const lx = ((i * 53) % 100) / 100 * w
      const ly = h * (0.78 + ((i * 37) % 12) / 100)
      const cols = ['#f59e0b', '#22d3ee', '#ec4899', '#a78bfa']
      g.fillStyle = cols[i % cols.length]
      g.globalAlpha = 0.5 + energy * 0.5
      g.beginPath(); g.arc(lx, ly, 2.4, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1
    }

    // drop banga
    if (drop) {
      g.strokeStyle = 'rgba(249,115,22,0.5)'; g.lineWidth = 3
      roundRectPath(g, 3, 3, w - 6, h - 6, 20); g.stroke()
    }

    // hype ženklai
    g.textAlign = 'center'; g.textBaseline = 'middle'
    for (const it of iconsRef.current) {
      if (it.resolved) continue
      g.font = `${it.good ? 26 : 24}px system-ui, sans-serif`
      if (it.good) { g.shadowColor = 'rgba(249,158,11,0.7)'; g.shadowBlur = 10 }
      g.fillText(it.emoji, it.x, it.y)
      g.shadowBlur = 0
    }
    g.textBaseline = 'alphabetic'

    // floats
    const nf: typeof floatsRef.current = []
    for (const f of floatsRef.current) {
      const age = gt - f.at
      if (age > 0.8) continue
      g.globalAlpha = Math.max(0, 1 - age / 0.8)
      g.fillStyle = f.color; g.font = '900 15px Outfit, system-ui, sans-serif'; g.textAlign = 'center'
      g.fillText(f.text, f.x, f.y - age * 34); g.globalAlpha = 1
      nf.push(f)
    }
    floatsRef.current = nf

    // HUD
    g.textAlign = 'left'; g.textBaseline = 'alphabetic'
    g.fillStyle = '#e7ebf2'; g.font = '900 20px Outfit, system-ui, sans-serif'
    g.fillText(`${scoreRef.current}`, 14, 28)
    if (comboRef.current >= 2) { g.fillStyle = '#f59e0b'; g.font = '900 12px Outfit, system-ui, sans-serif'; g.fillText(`serija ×${comboRef.current}${drop ? '  🔥×2' : ''}`, 14, 46) }
    g.textAlign = 'right'; g.font = '900 17px Outfit, system-ui, sans-serif'; g.fillStyle = '#f87171'
    g.fillText('❤'.repeat(Math.max(0, livesRef.current)), w - 12, 28)

    // premijinės gyvybės blyksnis
    const gage = gt - lifeFlashRef.current
    if (gage >= 0 && gage < 1) {
      g.globalAlpha = Math.max(0, (1 - gage) * 0.5)
      const gr = g.createLinearGradient(0, 0, 0, 70); gr.addColorStop(0, 'rgba(34,197,94,0.9)'); gr.addColorStop(1, 'rgba(34,197,94,0)')
      g.fillStyle = gr; g.fillRect(0, 0, w, 70); g.globalAlpha = 1
    }

    if (a && !endedRef.current) rafRef.current = requestAnimationFrame(loop)
  }

  return (
    <ZaidimoLangas title="Dienos koncertas" backHref="/zaidimai/testai" maxWidth={560}>
      <style>{css}</style>

      {phase === 'loading' && <div className="kc-center"><div className="kc-spinner" /><p className="kc-note">{artist ? `Ruošiam ${artist.name} koncertą…` : 'Renkam dienos atlikėją…'}</p></div>}
      {phase === 'error' && <div className="kc-center"><div className="kc-error">{err}</div><button className="kc-cta" onClick={() => void init()}>Bandyti dar</button></div>}

      {phase === 'ready' && artist && (
        <div className="kc-ready">
          <div className="kc-badge">DIENOS KONCERTAS</div>
          <div className="kc-artwrap"><img className="kc-art" src={proxyImg(artist.image, 240)} alt={artist.name} /></div>
          <h1 className="kc-h1">{artist.name}</h1>
          <p className="kc-lead">Šiandien scenoje — <b>{artist.name}</b>. Groja jo <b>{setlistRef.current.length} dainų setas</b>, finale — didžiausi hitai. Iš minios kyla hype (🙌❤️✨) — <b>baksteli juos</b>, kad minia siaustų. <b>📵 nespaudi.</b> Kuo arčiau finalo ir priedainių, tuo karščiau. 3 gyvybės.</p>
          <button className="kc-cta big" onClick={start}>▶ Į koncertą</button>
          <p className="kc-tiny">🔊 Įsijunk garsą — dainos energija valdo minią.</p>
        </div>
      )}

      {phase === 'play' && (
        <div className="kc-stage" onPointerDown={onPointerDown}>
          <div className="kc-topbar">🎤 {songNo}/{setlistRef.current.length} · {songLabel}</div>
          <canvas ref={canvasRef} className="kc-canvas" />
          <div className="kc-hint">baksteli 🙌❤️✨ · venk 📵</div>
        </div>
      )}

      {phase === 'results' && results && (
        <div className="kc-ready">
          <div className="kc-badge">KONCERTAS BAIGTAS</div>
          <div className="kc-score">{results.score}</div>
          <p className="kc-lead">Išbuvai iki <b>{results.songsSurvived}</b>/{setlistRef.current.length} dainos {artist ? <>· <b>{artist.name}</b></> : null}</p>
          <div className="kc-stats">
            <span className="kc-stat s-ok"><b>{results.hype}</b>hype</span>
            <span className="kc-stat s-warn"><b>{results.missed}</b>praleista</span>
            <span className="kc-stat s-star"><b>{results.best}</b>rekordas</span>
          </div>
          <ScoreDistribution scores={results.scores} score={results.score} percentile={results.percentile} />
          <div className="kc-actions">
            <button className="kc-cta" onClick={start}>Dar kartą</button>
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
.kc-lead { font-size: 14px; color: var(--text-secondary); line-height: 1.6; max-width: 380px; margin: 0 0 18px; }
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
.kc-stage { position: relative; width: 100%; height: 74vh; touch-action: none; user-select: none; cursor: pointer; }
.kc-canvas { width: 100%; height: 100%; display: block; }
.kc-topbar { position: absolute; top: 8px; left: 50%; transform: translateX(-50%); z-index: 3; max-width: 92%; font-size: 11px; font-weight: 800; color: #cbd5e1; background: rgba(11,15,24,0.7); border: 1px solid rgba(140,160,190,0.2); border-radius: 999px; padding: 4px 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; pointer-events: none; }
.kc-hint { position: absolute; bottom: 10px; left: 0; right: 0; text-align: center; font-size: 12px; color: rgba(231,235,242,0.7); pointer-events: none; }
`
