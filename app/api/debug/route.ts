import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
    NEXTAUTH_SECRET_exists: !!process.env.NEXTAUTH_SECRET,
    NEXTAUTH_SECRET_length: process.env.NEXTAUTH_SECRET?.length,
    GOOGLE_CLIENT_ID_exists: !!process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_ID_prefix: process.env.GOOGLE_CLIENT_ID?.substring(0, 20),
    GOOGLE_CLIENT_SECRET_exists: !!process.env.GOOGLE_CLIENT_SECRET,
    FACEBOOK_CLIENT_ID_exists: !!process.env.FACEBOOK_CLIENT_ID,
    SUPABASE_URL_exists: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_KEY_exists: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    nodeEnv: process.env.NODE_ENV,
  })
}
