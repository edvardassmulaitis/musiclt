import { NextResponse } from 'next/server'

export async function GET() {
  const env = {
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
    test: 'hello_world_v2',
  }
  
  return NextResponse.json(env)
}
