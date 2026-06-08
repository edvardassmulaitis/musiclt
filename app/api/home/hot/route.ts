import { NextResponse } from 'next/server'
import { getHotItems } from '@/lib/home/getHotItems'

export async function GET() {
  try {
    const items = await getHotItems()
    return NextResponse.json(items, {
      headers: {
        'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1200',
      },
    })
  } catch (e: any) {
    return NextResponse.json([], { status: 200 })
  }
}
