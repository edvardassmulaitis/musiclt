// app/api/push/vapid-public-key/route.ts
//
// Public endpoint, grąžina VAPID public key client'ui (kuriam reikia
// pushManager.subscribe({applicationServerKey: ...}) call'ui).
//
// Naudojam endpoint'ą (ne env'a tiesiai) tam, kad neišmestume client'ui
// build'inant projektą be šio key'aus — jeigu key dar nesukonfigūruotas,
// grąžinam null ir UI gracefully išjungia push toggle.

import { NextResponse } from 'next/server'

export async function GET() {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || null
  return NextResponse.json({ publicKey: key })
}
