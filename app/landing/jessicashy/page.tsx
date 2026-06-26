'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'

/* ------------------------------------------------------------------ *
 *  Jessica Shy — eksperimentinis atlikėjo pristatomasis (landing) psl.
 *  Pilnai self-contained: visa stilistika .jsl- prefiksu, kad neliestų
 *  globalių site stilių. Mobile-first.
 * ------------------------------------------------------------------ */

const BASE = '/landing/jessicashy'

const ALBUMS = [
  { title: 'Žvėris', year: '2025', img: `${BASE}/zveris.jpg`, kind: 'Albumas', url: 'https://open.spotify.com/album/6qTjtegmTDa5PmitQSqFk9' },
  { title: 'Rudenį Rūkai', year: '2025', img: `${BASE}/rudeni.jpg`, kind: 'Singlas', url: 'https://open.spotify.com/album/2Xz7nAWiuQAmw8bejs2R0e' },
  { title: 'Sutemos', year: '2024', img: `${BASE}/sutemos.jpg`, kind: 'Albumas', url: 'https://open.spotify.com/album/74FyZptrNJEkUd2r2lkv5A' },
  { title: 'Pasaka', year: '2023', img: `${BASE}/pasaka.jpg`, kind: 'Albumas', url: 'https://open.spotify.com/album/6SYCoF4BmXHB9ppAD9fufe' },
  { title: 'Apkabinti prisiminimus', year: '2022', img: `${BASE}/apkabinti.jpg`, kind: 'Albumas', url: 'https://open.spotify.com/album/7rxB0crsrIhNMX9ZV0o3xp' },
]

const TRACKS = [
  { t: 'Apkabink', p: 11637376 },
  { t: '1000 Vėtrų', p: 7038508 },
  { t: 'Vis Vien', p: 4315489 },
  { t: 'Žvėris', p: 3645785 },
  { t: 'Rudenį Rūkai', p: 986674 },
]

const STATS = [
  { n: '204K', l: 'mėnesinių klausytojų' },
  { n: '4×', l: '#1 albumai Lietuvoje' },
  { n: '40 000+', l: 'Dariaus ir Girėno stadione' },
  { n: '6', l: 'MAMA apdovanojimai' },
]

const MARQUEE = ['Apkabink', 'Vis Vien', 'Rugpjūtis', 'Šokam lėtai', 'Dėl tavęs', 'Tyliai pakuždėk', 'Žvėris', '1000 Vėtrų']

const TOUR = [
  { d: '28', m: 'Rugp', y: '2025', city: 'Vilnius', venue: 'Vingio parkas' },
  { d: '29', m: 'Rugp', y: '2025', city: 'Vilnius', venue: 'Vingio parkas' },
]

function fmt(n: number) {
  return n.toLocaleString('lt-LT')
}

export default function JessicaShyLanding() {
  const maxP = TRACKS[0].p
  const [scrolled, setScrolled] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  // Reveal-on-scroll
  useEffect(() => {
    const els = rootRef.current?.querySelectorAll('[data-reveal]')
    if (!els) return
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('jsl-in')
            io.unobserve(e.target)
          }
        })
      },
      { threshold: 0.15 },
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])

  // Sticky bar po scroll
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > window.innerHeight * 0.7)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div className="jsl-root" ref={rootRef}>
      {/* ====== Sticky mini bar ====== */}
      <div className={`jsl-bar ${scrolled ? 'jsl-bar--on' : ''}`}>
        <span className="jsl-bar-name">Jessica Shy</span>
        <a className="jsl-bar-cta" href="#klausytis">Klausytis</a>
      </div>

      {/* ====== HERO ====== */}
      <header className="jsl-hero">
        <div className="jsl-hero-bg" />
        <div className="jsl-aurora" />
        <div className="jsl-grain" />
        <div className="jsl-hero-inner">
          <div className="jsl-eyebrow">
            <span className="jsl-dot" /> 204 465 mėnesinių klausytojų · Spotify
          </div>
          <h1 className="jsl-title">
            <span>JESSICA</span>
            <span className="jsl-title-2">SHY</span>
          </h1>
          <p className="jsl-tagline">
            Lietuvos pop scenos <em>žvėris</em>. Keturi #1 albumai, stadionus užpildantis balsas.
          </p>
          <div className="jsl-cta-row">
            <a className="jsl-btn jsl-btn--p" href="#klausytis">▶ Klausytis</a>
            <a className="jsl-btn jsl-btn--g" href="https://open.spotify.com/artist/0CinAWYkte8opxVAPI3nMu" target="_blank" rel="noreferrer">Spotify</a>
          </div>
        </div>
        <div className="jsl-scroll">
          <span>slink žemyn</span>
          <i />
        </div>
      </header>

      {/* ====== Marquee ====== */}
      <div className="jsl-marquee" aria-hidden>
        <div className="jsl-marquee-track">
          {[...MARQUEE, ...MARQUEE].map((m, i) => (
            <span key={i}>{m} <b>✦</b> </span>
          ))}
        </div>
      </div>

      {/* ====== Stats ====== */}
      <section className="jsl-stats" data-reveal>
        {STATS.map((s, i) => (
          <div className="jsl-stat" key={i} style={{ '--d': `${i * 90}ms` } as CSSProperties}>
            <div className="jsl-stat-n">{s.n}</div>
            <div className="jsl-stat-l">{s.l}</div>
          </div>
        ))}
      </section>

      {/* ====== Discografija ====== */}
      <section className="jsl-sec" data-reveal>
        <div className="jsl-sec-head">
          <span className="jsl-kicker">01 — Diskografija</span>
          <h2 className="jsl-h2">Albumai &amp; singlai</h2>
        </div>
        <div className="jsl-disco">
          {ALBUMS.map((a, i) => (
            <a className="jsl-album" key={i} href={a.url} target="_blank" rel="noreferrer" style={{ '--d': `${i * 70}ms` } as CSSProperties}>
              <div className="jsl-album-art">
                <img src={a.img} alt={a.title} loading="lazy" />
                <span className="jsl-album-play">▶</span>
              </div>
              <div className="jsl-album-meta">
                <span className="jsl-album-title">{a.title}</span>
                <span className="jsl-album-sub">{a.kind} · {a.year}</span>
              </div>
            </a>
          ))}
        </div>
      </section>

      {/* ====== Top dainos ====== */}
      <section className="jsl-sec" data-reveal>
        <div className="jsl-sec-head">
          <span className="jsl-kicker">02 — Klausomiausios</span>
          <h2 className="jsl-h2">Populiariausios dainos</h2>
        </div>
        <ol className="jsl-tracks">
          {TRACKS.map((tr, i) => (
            <li className="jsl-track" key={i} style={{ '--d': `${i * 60}ms` } as CSSProperties}>
              <span className="jsl-track-n">{String(i + 1).padStart(2, '0')}</span>
              <span className="jsl-track-t">{tr.t}</span>
              <span className="jsl-track-bar"><i style={{ width: `${(tr.p / maxP) * 100}%` }} /></span>
              <span className="jsl-track-p">{fmt(tr.p)}</span>
            </li>
          ))}
        </ol>
      </section>

      {/* ====== Klausytis (Spotify embed) ====== */}
      <section className="jsl-sec jsl-listen" id="klausytis" data-reveal>
        <div className="jsl-sec-head">
          <span className="jsl-kicker">03 — Klausytis</span>
          <h2 className="jsl-h2">Įsijunk dabar</h2>
        </div>
        <div className="jsl-embed">
          <iframe
            title="Jessica Shy Spotify"
            src="https://open.spotify.com/embed/artist/0CinAWYkte8opxVAPI3nMu?utm_source=generator&theme=0"
            width="100%"
            height="420"
            frameBorder={0}
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            loading="lazy"
          />
        </div>
      </section>

      {/* ====== Koncertai ====== */}
      <section className="jsl-sec" data-reveal>
        <div className="jsl-sec-head">
          <span className="jsl-kicker">04 — Gyvai</span>
          <h2 className="jsl-h2">Artimiausi koncertai</h2>
        </div>
        <div className="jsl-tour">
          {TOUR.map((t, i) => (
            <div className="jsl-tour-row" key={i} style={{ '--d': `${i * 80}ms` } as CSSProperties}>
              <div className="jsl-tour-date">
                <span className="jsl-tour-d">{t.d}</span>
                <span className="jsl-tour-m">{t.m} {t.y}</span>
              </div>
              <div className="jsl-tour-info">
                <span className="jsl-tour-venue">{t.venue}</span>
                <span className="jsl-tour-city">{t.city}</span>
              </div>
              <a className="jsl-tour-btn" href="https://www.bilietai.lt/lt/atlikejas/jessica-shy/" target="_blank" rel="noreferrer">Bilietai</a>
            </div>
          ))}
        </div>
      </section>

      {/* ====== Bio ====== */}
      <section className="jsl-sec jsl-bio" data-reveal>
        <div className="jsl-bio-img">
          <img src={`${BASE}/zveris-hi.jpg`} alt="Jessica Shy — Žvėris" loading="lazy" />
        </div>
        <div className="jsl-bio-text">
          <span className="jsl-kicker">Istorija</span>
          <h2 className="jsl-h2">Nuo Birštono iki stadionų</h2>
          <p>
            Džesika Šyvokaitė — <strong>Jessica Shy</strong> — dainuoti pradėjo būdama ketverių.
            Iš mažo Birštono per Londono sceną ji tapo viena ryškiausių Lietuvos pop balsų.
          </p>
          <p>
            Keturi iš eilės į pirmą vietą šovę albumai, dešimtys MAMA nominacijų ir
            rekordiniai pasirodymai — 40&nbsp;000+ žiūrovų Dariaus ir Girėno stadione bei
            trys išparduoti vakarai Kalnų parke.
          </p>
          <div className="jsl-bio-socials">
            <a href="https://open.spotify.com/artist/0CinAWYkte8opxVAPI3nMu" target="_blank" rel="noreferrer">Spotify</a>
            <a href="https://instagram.com/jessica_shy_" target="_blank" rel="noreferrer">Instagram</a>
            <a href="https://www.youtube.com/@openplaylt" target="_blank" rel="noreferrer">YouTube</a>
            <a href="https://facebook.com/jessicaShywouh" target="_blank" rel="noreferrer">Facebook</a>
          </div>
        </div>
      </section>

      {/* ====== Footer ====== */}
      <footer className="jsl-foot">
        <span className="jsl-foot-name">Jessica Shy</span>
        <span className="jsl-foot-by">Pristatomasis puslapis · <a href="https://musiclt.vercel.app" target="_blank" rel="noreferrer">Music.lt</a></span>
      </footer>

      <style>{css}</style>
    </div>
  )
}

const css = `
.jsl-root{
  --bg:#08070b; --bg2:#0e0b14;
  --ink:#f5f1ff; --mut:#a99fc0;
  --p1:#ff2d7e; --p2:#b14bff; --p3:#ffb347;
  --card:rgba(255,255,255,.045); --line:rgba(255,255,255,.10);
  position:relative; background:var(--bg); color:var(--ink);
  font-family:'DM Sans',system-ui,sans-serif; overflow-x:hidden;
  -webkit-font-smoothing:antialiased; letter-spacing:.01em;
}
.jsl-root *{box-sizing:border-box;}
.jsl-root a{color:inherit;text-decoration:none;}

/* ---------- Sticky bar ---------- */
.jsl-bar{position:fixed;top:0;left:0;right:0;z-index:50;display:flex;align-items:center;
  justify-content:space-between;padding:14px 20px;
  background:rgba(8,7,11,.6);backdrop-filter:blur(14px);
  border-bottom:1px solid transparent;transform:translateY(-100%);
  transition:transform .45s cubic-bezier(.2,.8,.2,1),border-color .45s;}
.jsl-bar--on{transform:translateY(0);border-color:var(--line);}
.jsl-bar-name{font-family:'Outfit',sans-serif;font-weight:800;letter-spacing:.08em;font-size:15px;}
.jsl-bar-cta{font-size:13px;font-weight:700;padding:8px 16px;border-radius:999px;
  background:linear-gradient(90deg,var(--p1),var(--p2));color:#fff;}

/* ---------- Hero ---------- */
.jsl-hero{position:relative;min-height:100svh;display:flex;flex-direction:column;
  justify-content:flex-end;padding:0 22px 96px;overflow:hidden;}
.jsl-hero-bg{position:absolute;inset:0;background:url('${BASE}/hero.jpg') center 18%/cover no-repeat;
  filter:saturate(1.05) contrast(1.02);transform:scale(1.06);animation:jslKen 18s ease-in-out infinite alternate;}
.jsl-hero-bg::after{content:'';position:absolute;inset:0;
  background:linear-gradient(180deg,rgba(8,7,11,.35) 0%,rgba(8,7,11,.1) 30%,rgba(8,7,11,.72) 72%,var(--bg) 100%);}
@keyframes jslKen{from{transform:scale(1.06) translateY(0)}to{transform:scale(1.14) translateY(-12px)}}
.jsl-aurora{position:absolute;inset:-30% -10% auto;height:80%;z-index:1;pointer-events:none;
  background:radial-gradient(40% 50% at 20% 30%,rgba(255,45,126,.45),transparent 70%),
             radial-gradient(45% 55% at 85% 20%,rgba(177,75,255,.42),transparent 70%),
             radial-gradient(40% 50% at 60% 70%,rgba(255,179,71,.25),transparent 70%);
  filter:blur(40px);mix-blend-mode:screen;animation:jslFloat 14s ease-in-out infinite alternate;}
@keyframes jslFloat{from{transform:translate(0,0)}to{transform:translate(-4%,6%)}}
.jsl-grain{position:absolute;inset:0;z-index:2;pointer-events:none;opacity:.5;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.5'/%3E%3C/svg%3E");
  mix-blend-mode:overlay;}
.jsl-hero-inner{position:relative;z-index:3;max-width:1100px;width:100%;margin:0 auto;}
.jsl-eyebrow{display:inline-flex;align-items:center;gap:9px;font-size:12px;font-weight:600;
  letter-spacing:.14em;text-transform:uppercase;color:var(--mut);
  background:rgba(255,255,255,.06);border:1px solid var(--line);padding:8px 14px;border-radius:999px;
  backdrop-filter:blur(8px);}
.jsl-dot{width:7px;height:7px;border-radius:50%;background:#1ed760;box-shadow:0 0 0 0 rgba(30,215,96,.6);animation:jslPulse 2s infinite;}
@keyframes jslPulse{0%{box-shadow:0 0 0 0 rgba(30,215,96,.55)}70%{box-shadow:0 0 0 10px rgba(30,215,96,0)}100%{box-shadow:0 0 0 0 rgba(30,215,96,0)}}
.jsl-title{font-family:'Outfit',sans-serif;font-weight:900;line-height:.86;margin:18px 0 0;
  font-size:clamp(58px,19vw,168px);letter-spacing:-.02em;}
.jsl-title span{display:block;}
.jsl-title-2{background:linear-gradient(92deg,var(--p1),var(--p2) 55%,var(--p3));
  -webkit-background-clip:text;background-clip:text;color:transparent;
  filter:drop-shadow(0 6px 30px rgba(255,45,126,.35));}
.jsl-tagline{max-width:520px;margin:22px 0 0;font-size:clamp(16px,4.6vw,21px);line-height:1.5;color:#e7e1f5;}
.jsl-tagline em{font-style:italic;color:var(--p3);}
.jsl-cta-row{display:flex;gap:12px;margin-top:30px;flex-wrap:wrap;}
.jsl-btn{display:inline-flex;align-items:center;gap:8px;padding:15px 28px;border-radius:999px;
  font-weight:700;font-size:15px;transition:transform .25s,box-shadow .25s,background .25s;}
.jsl-btn--p{background:linear-gradient(90deg,var(--p1),var(--p2));color:#fff;
  box-shadow:0 10px 34px -8px rgba(255,45,126,.6);}
.jsl-btn--p:hover{transform:translateY(-2px);box-shadow:0 16px 40px -8px rgba(255,45,126,.75);}
.jsl-btn--g{border:1px solid var(--line);background:rgba(255,255,255,.05);color:#fff;backdrop-filter:blur(8px);}
.jsl-btn--g:hover{background:rgba(255,255,255,.12);transform:translateY(-2px);}
.jsl-scroll{position:absolute;left:50%;bottom:26px;transform:translateX(-50%);z-index:3;
  display:flex;flex-direction:column;align-items:center;gap:8px;font-size:10px;letter-spacing:.22em;
  text-transform:uppercase;color:var(--mut);}
.jsl-scroll i{width:1px;height:34px;background:linear-gradient(var(--mut),transparent);animation:jslDrop 1.8s ease-in-out infinite;}
@keyframes jslDrop{0%{transform:scaleY(.2);transform-origin:top;opacity:.3}50%{transform:scaleY(1);opacity:1}100%{transform:scaleY(.2);transform-origin:bottom;opacity:.3}}

/* ---------- Marquee ---------- */
.jsl-marquee{border-top:1px solid var(--line);border-bottom:1px solid var(--line);
  padding:18px 0;overflow:hidden;background:var(--bg2);}
.jsl-marquee-track{display:inline-flex;white-space:nowrap;animation:jslScroll 28s linear infinite;
  font-family:'Outfit',sans-serif;font-weight:800;font-size:clamp(20px,5vw,30px);
  text-transform:uppercase;letter-spacing:.02em;color:#fff;}
.jsl-marquee-track span{padding:0 6px;color:#cdbfe9;}
.jsl-marquee-track b{color:var(--p1);}
@keyframes jslScroll{from{transform:translateX(0)}to{transform:translateX(-50%)}}

/* ---------- Sections ---------- */
.jsl-sec{max-width:1100px;margin:0 auto;padding:74px 22px;}
.jsl-sec-head{margin-bottom:30px;}
.jsl-kicker{display:block;font-size:12px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;
  color:var(--p2);margin-bottom:10px;}
.jsl-h2{font-family:'Outfit',sans-serif;font-weight:800;font-size:clamp(28px,7vw,46px);
  letter-spacing:-.01em;line-height:1.05;margin:0;}

/* reveal */
[data-reveal]{opacity:0;transform:translateY(28px);transition:opacity .8s ease,transform .8s cubic-bezier(.2,.8,.2,1);}
[data-reveal].jsl-in{opacity:1;transform:none;}

/* ---------- Stats ---------- */
.jsl-stats{max-width:1100px;margin:0 auto;padding:48px 22px;display:grid;
  grid-template-columns:repeat(2,1fr);gap:14px;}
.jsl-stat{background:var(--card);border:1px solid var(--line);border-radius:20px;padding:24px 18px;
  transition:transform .6s ease,opacity .6s ease,border-color .3s;transition-delay:var(--d);}
.jsl-stat:hover{border-color:rgba(255,45,126,.4);transform:translateY(-3px);}
.jsl-stat-n{font-family:'Outfit',sans-serif;font-weight:900;font-size:clamp(30px,9vw,46px);
  background:linear-gradient(92deg,var(--p1),var(--p3));-webkit-background-clip:text;background-clip:text;color:transparent;line-height:1;}
.jsl-stat-l{margin-top:10px;font-size:13px;color:var(--mut);line-height:1.35;}

/* ---------- Discography ---------- */
.jsl-disco{display:flex;gap:16px;overflow-x:auto;padding:6px 2px 18px;scroll-snap-type:x mandatory;
  -webkit-overflow-scrolling:touch;}
.jsl-disco::-webkit-scrollbar{height:6px;}
.jsl-disco::-webkit-scrollbar-thumb{background:var(--line);border-radius:999px;}
.jsl-album{flex:0 0 auto;width:200px;scroll-snap-align:start;transition:transform .55s ease,opacity .55s ease;transition-delay:var(--d);}
.jsl-album-art{position:relative;border-radius:16px;overflow:hidden;aspect-ratio:1;
  box-shadow:0 18px 44px -16px rgba(0,0,0,.7);border:1px solid var(--line);}
.jsl-album-art img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .6s ease;}
.jsl-album:hover .jsl-album-art img{transform:scale(1.08);}
.jsl-album-play{position:absolute;right:12px;bottom:12px;width:44px;height:44px;border-radius:50%;
  display:grid;place-items:center;font-size:15px;color:#fff;
  background:linear-gradient(90deg,var(--p1),var(--p2));box-shadow:0 8px 22px -6px rgba(255,45,126,.7);
  opacity:0;transform:translateY(8px) scale(.9);transition:.4s;}
.jsl-album:hover .jsl-album-play{opacity:1;transform:none;}
.jsl-album-meta{display:flex;flex-direction:column;margin-top:14px;}
.jsl-album-title{font-family:'Outfit',sans-serif;font-weight:700;font-size:16px;}
.jsl-album-sub{font-size:12px;color:var(--mut);margin-top:3px;}

/* ---------- Tracks ---------- */
.jsl-tracks{list-style:none;margin:0;padding:0;}
.jsl-track{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:12px 14px;
  padding:16px 4px;border-bottom:1px solid var(--line);transition:opacity .6s ease,transform .6s ease;transition-delay:var(--d);}
.jsl-track-n{font-family:'Outfit',sans-serif;font-weight:800;font-size:15px;color:var(--p2);width:26px;}
.jsl-track-t{font-weight:600;font-size:clamp(16px,4.5vw,19px);}
.jsl-track-p{font-size:12px;color:var(--mut);font-variant-numeric:tabular-nums;}
.jsl-track-bar{grid-column:1/-1;height:4px;border-radius:999px;background:rgba(255,255,255,.08);overflow:hidden;}
.jsl-track-bar i{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,var(--p1),var(--p3));}

/* ---------- Listen / embed ---------- */
.jsl-embed{border-radius:18px;overflow:hidden;border:1px solid var(--line);
  box-shadow:0 24px 60px -22px rgba(177,75,255,.5);}
.jsl-embed iframe{display:block;border:0;}

/* ---------- Tour ---------- */
.jsl-tour{display:flex;flex-direction:column;gap:12px;}
.jsl-tour-row{display:flex;align-items:center;gap:16px;padding:18px;border-radius:18px;
  background:var(--card);border:1px solid var(--line);transition:opacity .6s ease,transform .6s ease,border-color .3s;transition-delay:var(--d);}
.jsl-tour-row:hover{border-color:rgba(177,75,255,.45);}
.jsl-tour-date{display:flex;flex-direction:column;min-width:64px;}
.jsl-tour-d{font-family:'Outfit',sans-serif;font-weight:900;font-size:34px;line-height:1;}
.jsl-tour-m{font-size:12px;color:var(--mut);text-transform:uppercase;letter-spacing:.08em;}
.jsl-tour-info{flex:1;display:flex;flex-direction:column;}
.jsl-tour-venue{font-weight:700;font-size:16px;}
.jsl-tour-city{font-size:13px;color:var(--mut);}
.jsl-tour-btn{padding:11px 20px;border-radius:999px;font-weight:700;font-size:13px;
  border:1px solid var(--line);background:rgba(255,255,255,.05);transition:.25s;}
.jsl-tour-btn:hover{background:linear-gradient(90deg,var(--p1),var(--p2));border-color:transparent;color:#fff;}

/* ---------- Bio ---------- */
.jsl-bio{display:grid;grid-template-columns:1fr;gap:30px;align-items:center;}
.jsl-bio-img{border-radius:22px;overflow:hidden;border:1px solid var(--line);
  box-shadow:0 30px 70px -30px rgba(0,0,0,.8);aspect-ratio:1;}
.jsl-bio-img img{width:100%;height:100%;object-fit:cover;display:block;}
.jsl-bio-text p{color:#d9d2ec;font-size:16px;line-height:1.65;margin:14px 0 0;}
.jsl-bio-text strong{color:#fff;}
.jsl-bio-socials{display:flex;flex-wrap:wrap;gap:10px;margin-top:26px;}
.jsl-bio-socials a{padding:11px 20px;border-radius:999px;border:1px solid var(--line);
  background:rgba(255,255,255,.05);font-weight:600;font-size:14px;transition:.25s;}
.jsl-bio-socials a:hover{background:rgba(255,255,255,.12);transform:translateY(-2px);}

/* ---------- Footer ---------- */
.jsl-foot{border-top:1px solid var(--line);padding:42px 22px 64px;text-align:center;
  display:flex;flex-direction:column;gap:8px;}
.jsl-foot-name{font-family:'Outfit',sans-serif;font-weight:900;font-size:26px;letter-spacing:.04em;
  background:linear-gradient(92deg,var(--p1),var(--p2),var(--p3));-webkit-background-clip:text;background-clip:text;color:transparent;}
.jsl-foot-by{font-size:12px;color:var(--mut);}
.jsl-foot-by a{color:var(--p2);font-weight:600;}

/* ---------- Desktop ---------- */
@media(min-width:760px){
  .jsl-stats{grid-template-columns:repeat(4,1fr);gap:18px;}
  .jsl-album{width:230px;}
  .jsl-bio{grid-template-columns:.85fr 1.15fr;gap:48px;}
  .jsl-hero{padding-bottom:120px;}
  .jsl-track{grid-template-columns:auto 1fr 220px auto;}
  .jsl-track-bar{grid-column:auto;}
}
@media(prefers-reduced-motion:reduce){
  .jsl-hero-bg,.jsl-aurora,.jsl-marquee-track,.jsl-scroll i,.jsl-dot{animation:none;}
  [data-reveal]{opacity:1;transform:none;}
}
`
