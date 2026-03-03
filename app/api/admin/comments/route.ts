import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.role || !["admin", "super_admin"].includes(session.user.role))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const entityType = searchParams.get("entity_type")
  const reported = searchParams.get("reported") === "true"
  const deleted = searchParams.get("deleted") === "true"
  const limit = parseInt(searchParams.get("limit") || "100")
  const offset = parseInt(searchParams.get("offset") || "0")

  const supabase = createAdminClient()

  let query = supabase
    .from("comments")
    .select("id, author_id, track_id, album_id, news_id, event_id, body, is_deleted, reported_count, like_count, created_at, profiles:author_id ( name, avatar_url )", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1)

  if (deleted) query = query.eq("is_deleted", true)
  else if (reported) query = query.gt("reported_count", 0).eq("is_deleted", false)
  else query = query.eq("is_deleted", false)

  // Entity type filter
  if (entityType === "track") query = query.not("track_id", "is", null)
  else if (entityType === "album") query = query.not("album_id", "is", null)
  else if (entityType === "news") query = query.not("news_id", "is", null)
  else if (entityType === "event") query = query.not("event_id", "is", null)

  const { data, count, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Normalize for frontend
  const comments = (data || []).map((c: any) => {
    const entity_type = c.track_id ? "track" : c.album_id ? "album" : c.news_id ? "news" : c.event_id ? "event" : "unknown"
    const entity_id = c.track_id || c.album_id || c.news_id || c.event_id || 0
    return {
      id: c.id,
      entity_type,
      entity_id,
      user_id: c.author_id,
      author_name: c.profiles?.name || "Vartotojas",
      body: c.body,
      is_deleted: c.is_deleted,
      reported_count: c.reported_count || 0,
      like_count: c.like_count || 0,
      created_at: c.created_at,
      depth: 0,
    }
  })

  return NextResponse.json({ comments, total: count || 0 })
}
