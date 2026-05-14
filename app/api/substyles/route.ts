/**
 * GET /api/substyles
 *   Grąžiną visus public.substyles (id, name, slug). Naudojama tiek
 *   Wikipedia importo fuzzy-match'inimui (lib/genre-match), tiek admin
 *   album form'os substyle picker'iui.
 *
 *   Skaitymas atviras visiems (nedraudžiame, kad anonymous user gali
 *   pasiimti taxonomy listą — viešas content'as kaip ir SUBSTYLES TS
 *   konstanta lib/constants.ts).
 */
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  const { data, error } = await supabase
    .from('substyles')
    .select('id, name, slug')
    .order('name', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ substyles: data || [] })
}
