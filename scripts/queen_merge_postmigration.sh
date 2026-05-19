#!/usr/bin/env bash
# ============================================================
# 2026-05-19 — Queen track merges po merge_tracks RPC v2 apply'o
# ============================================================
#
# Paleisti TIK PO TO, kai aplikuota migracija:
#   node scripts/run-migration.mjs supabase/migrations/20260519_merge_tracks_likes_comments.sql
#
# Iki tol — sena RPC versija (a) prarastų 6 Queen Barcelona likes,
# (b) pridėtų Queen kaip featuring į FM Barcelona track'ą (klaidinga).
#
# Naudojimas:
#   bash scripts/queen_merge_postmigration.sh
# ============================================================

set -euo pipefail

# Load env iš .env.local
if [ -f .env.local ]; then
  set -a
  source .env.local
  set +a
fi

SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL:-https://tyvribkcymenlvnrwkdz.supabase.co}"
SRK="${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY env var required}"

run_merge() {
  local winner=$1
  local loser=$2
  local label=$3
  echo ""
  echo "──────────────────────────────────────────────"
  echo "Merge: $label"
  echo "  winner=$winner (kanoninė versija)"
  echo "  loser=$loser  (dublikatas)"
  echo "──────────────────────────────────────────────"

  # Pre-merge state
  echo "Prieš merge:"
  for tid in $winner $loser; do
    L=$(curl -sI "$SUPABASE_URL/rest/v1/likes?entity_type=eq.track&entity_id=eq.$tid&select=id" \
      -H "apikey: $SRK" -H "Authorization: Bearer $SRK" -H "Prefer: count=exact" -H "Range: 0-0" | \
      grep -i content-range | tr -d '\r' | sed 's|.*/||')
    C=$(curl -sI "$SUPABASE_URL/rest/v1/comments?track_id=eq.$tid&select=id" \
      -H "apikey: $SRK" -H "Authorization: Bearer $SRK" -H "Prefer: count=exact" -H "Range: 0-0" | \
      grep -i content-range | tr -d '\r' | sed 's|.*/||')
    echo "    track $tid: likes=$L comments=$C"
  done

  # Call RPC
  RESULT=$(curl -s -X POST "$SUPABASE_URL/rest/v1/rpc/merge_tracks" \
    -H "apikey: $SRK" -H "Authorization: Bearer $SRK" \
    -H "Content-Type: application/json" \
    -d "{\"p_winner_id\": $winner, \"p_loser_id\": $loser, \"p_field_choices\": {}}")
  echo "RPC result: $RESULT"

  # Post-merge state
  echo "Po merge:"
  L=$(curl -sI "$SUPABASE_URL/rest/v1/likes?entity_type=eq.track&entity_id=eq.$winner&select=id" \
    -H "apikey: $SRK" -H "Authorization: Bearer $SRK" -H "Prefer: count=exact" -H "Range: 0-0" | \
    grep -i content-range | tr -d '\r' | sed 's|.*/||')
  C=$(curl -sI "$SUPABASE_URL/rest/v1/comments?track_id=eq.$winner&select=id" \
    -H "apikey: $SRK" -H "Authorization: Bearer $SRK" -H "Prefer: count=exact" -H "Range: 0-0" | \
    grep -i content-range | tr -d '\r' | sed 's|.*/||')
  echo "    winner $winner: likes=$L comments=$C"

  # Verify loser deleted
  LOSER_EXISTS=$(curl -sI "$SUPABASE_URL/rest/v1/tracks?id=eq.$loser&select=id" \
    -H "apikey: $SRK" -H "Authorization: Bearer $SRK" -H "Prefer: count=exact" -H "Range: 0-0" | \
    grep -i content-range | tr -d '\r' | sed 's|.*/||')
  echo "    loser $loser exists: $LOSER_EXISTS (turi būti 0)"

  # Verify NO Queen featuring on winner (sanity check kad nauja RPC veikia)
  FEAT=$(curl -s "$SUPABASE_URL/rest/v1/track_artists?track_id=eq.$winner&select=artist_id" \
    -H "apikey: $SRK" -H "Authorization: Bearer $SRK")
  echo "    winner featuring: $FEAT"
  echo "    (jei matai Queen artist_id=500 — RPC v2 dar neaplikuota!)"
}

run_merge 107931 107783 "Barcelona (FM solo ← Queen attribution dublikatas)"
run_merge 107938 107802 "The Great Pretender (FM solo cover ← Queen attribution klaida)"

echo ""
echo "✓ Merge'ai paleisti. Patikrink admin UI'e Queen Greatest Hits III"
echo "  ir albumus 100872 (FM Barcelona), 100875 (Mercury Album)."
