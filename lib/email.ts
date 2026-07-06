// lib/email.ts
//
// Bendras išsiunčiamų laiškų helper'is ant esamo Resend (žr. magic-link route).
// Defensyvus: jei RESEND_API_KEY nesukonfigūruotas — no-op (negriauna srauto).
//
// Naudojama: claim patvirtinimo laiškas, atlikėjo žinutės fanams el. paštu.

import { Resend } from 'resend'
import { createHmac } from 'crypto'
import { sendViaGmail } from '@/lib/gmail-send'

// Transportas: 'gmail' — siunčia per Gmail API (be domeno verifikacijos, testui);
// kitu atveju — Resend (reikalauja verifikuoto domeno produkcijai).
const TRANSPORT = (process.env.EMAIL_TRANSPORT || 'resend').toLowerCase()
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null
const FROM = process.env.EMAIL_FROM || 'music.lt <onboarding@resend.dev>'
// BASE: produkcijos URL nuorodoms laiškuose. music.lt dar nevaldom → default Vercel.
const BASE = process.env.NEXTAUTH_URL || 'https://musiclt.vercel.app'
const SECRET = process.env.INTERNAL_API_SECRET || process.env.NEXTAUTH_SECRET || ''

export type SendResult = { ok: boolean; error?: string }

export async function sendEmail(opts: {
  to: string
  subject: string
  html: string
  replyTo?: string
  headers?: Record<string, string>
}): Promise<SendResult> {
  // Gmail transportas — naudojamas kol nėra verifikuoto Resend domeno.
  if (TRANSPORT === 'gmail') {
    const r = await sendViaGmail({
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      replyTo: opts.replyTo,
    })
    if (!r.ok) console.warn('[email] Gmail send nepavyko:', r.error)
    return r
  }

  if (!resend) {
    console.warn('[email] RESEND_API_KEY nesukonfigūruotas — laiškas neišsiųstas')
    return { ok: false, error: 'not_configured' }
  }
  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      replyTo: opts.replyTo,
      headers: opts.headers,
    } as any)
    if (error) return { ok: false, error: (error as any)?.message || 'send_failed' }
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message || 'send_failed' }
  }
}

/** HMAC parašas unsubscribe nuorodai (be DB tokenų). */
export function unsubscribeSig(artistId: number, profileId: string): string {
  return createHmac('sha256', SECRET).update(`${artistId}:${profileId}`).digest('hex').slice(0, 32)
}

export function unsubscribeUrl(artistId: number, profileId: string): string {
  const sig = unsubscribeSig(artistId, profileId)
  return `${BASE}/api/studija/unsubscribe?a=${artistId}&u=${encodeURIComponent(profileId)}&s=${sig}`
}

/** Bendras music.lt laiško šablonas. */
export function emailLayout(opts: {
  heading: string
  bodyHtml: string
  ctaUrl?: string
  ctaLabel?: string
  footerHtml?: string
}): string {
  const cta = opts.ctaUrl && opts.ctaLabel
    ? `<a href="${opts.ctaUrl}" style="display:inline-block;background-color:#f97316;background:linear-gradient(135deg,#1a73e8,#f97316);color:#fff;font-weight:700;padding:16px 36px;border-radius:12px;text-decoration:none;font-size:16px;margin-top:8px;">${opts.ctaLabel}</a>`
    : ''
  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:40px 24px;color:#1a1a1a;">
    <h1 style="font-size:26px;font-weight:900;margin:0 0 4px;">
      <span style="color:#1a73e8">music</span><span style="color:#f97316">.lt</span>
    </h1>
    <p style="color:#888;font-size:13px;margin:0 0 28px;">Didžiausias lietuviškos muzikos portalas</p>
    <h2 style="font-size:20px;margin:0 0 12px;">${opts.heading}</h2>
    <div style="color:#444;font-size:15px;line-height:1.6;">${opts.bodyHtml}</div>
    ${cta ? `<div style="margin-top:24px;">${cta}</div>` : ''}
    <hr style="border:none;border-top:1px solid #eee;margin:32px 0 16px;" />
    <p style="color:#aaa;font-size:12px;line-height:1.5;">${opts.footerHtml || 'music.lt'}</p>
  </div>`
}
