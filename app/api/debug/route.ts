import { NextResponse } from 'next/server'
export async function GET() {
  return NextResponse.json({
    hasApiKey: !!process.env.ANTHROPIC_API_KEY,
    keyPrefix: process.env.ANTHROPIC_API_KEY?.substring(0, 10) + '...',
    nodeEnv: process.env.NODE_ENV,
  })
}
