#!/usr/bin/env node
/**
 * Boombox / general migration runner.
 *
 * Naudojimas:
 *   node scripts/run-migration.mjs <path/to/migration.sql>
 *   node scripts/run-migration.mjs supabase/migrations/20260429b_boombox_schema.sql
 *
 * Reikia .env.local'e:
 *   DATABASE_URL=postgresql://postgres.<project>:<PASSWORD>@aws-0-<region>.pooler.supabase.com:6543/postgres
 *
 * Kaip gauti DATABASE_URL:
 *   1. https://supabase.com/dashboard/project/_/settings/database
 *   2. Connection string → Mode: "Transaction" (pooler)
 *   3. Display connect string → copy
 *   4. Pakeisk [YOUR-PASSWORD] į DB password (jei pamiršai — ten pat reset'as)
 *
 * Saugumas:
 *   - Skript'as nieko nelogina (be slaptažodžio)
 *   - Migracijos turi būti idempotent'iškos (CREATE TABLE IF NOT EXISTS, etc.)
 *   - Klaida → exit 1, transakcija rollback'inasi (jei BEGIN/COMMIT yra)
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import pg from 'pg'

// ── Load .env.local manually (be Next.js context) ──
function loadEnvLocal() {
  try {
    const text = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
    for (const line of text.split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
      if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch (_e) { /* not present, OK */ }
}

loadEnvLocal()

const file = process.argv[2]
if (!file) {
  console.error('Usage: node scripts/run-migration.mjs <path/to/migration.sql>')
  process.exit(1)
}

const dbUrl = process.env.DATABASE_URL
if (!dbUrl) {
  console.error('❌ DATABASE_URL nerastas .env.local — žr. komentarą skript\'o viršuje.')
  process.exit(1)
}

const sqlPath = resolve(process.cwd(), file)
let sql
try {
  sql = readFileSync(sqlPath, 'utf8')
} catch (e) {
  console.error(`❌ Nepavyko perskaityti ${sqlPath}: ${e.message}`)
  process.exit(1)
}

console.log(`→ Paleidžiu ${file} (${sql.length} chars)`)

const client = new pg.Client({
  connectionString: dbUrl,
  // Supabase pooler reikia SSL be cert validacijos
  ssl: { rejectUnauthorized: false },
})

try {
  await client.connect()
  const start = Date.now()
  await client.query(sql)
  const elapsed = Date.now() - start
  console.log(`✓ Sėkmingai (${elapsed}ms)`)
} catch (e) {
  console.error(`❌ Klaida: ${e.message}`)
  if (e.position) console.error(`   pozicija: ${e.position}`)
  if (e.detail) console.error(`   detail: ${e.detail}`)
  if (e.hint) console.error(`   hint: ${e.hint}`)
  process.exit(1)
} finally {
  await client.end()
}
