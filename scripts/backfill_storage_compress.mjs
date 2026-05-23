#!/usr/bin/env node
/**
 * backfill_storage_compress.mjs
 *
 * Esamų covers bucket'o failų backfill kompresija. Visi >100KB jpeg/png failai,
 * įkelti iki 2026-05-23 sharp fix'o, vis dar saugomi originaliu dydžiu.
 *
 * Strategija (in-place, BE DB pakeitimų):
 *   - List visus covers/ failus
 *   - Filtruok jpeg/png > MIN_BYTES
 *   - Download per Supabase Storage public URL
 *   - sharp resize 1920px max, webp q80
 *   - Jeigu output >= input — skip (failas jau gerai suspaustas)
 *   - Else upload upsert:true tuo PAČIU path'u, contentType: image/webp
 *
 * Kodėl be DB pakeitimų?
 *   - DB kolonose URL'ai turi `.jpg`/`.png` plėtinį, bet content stored — webp.
 *   - Browser'iai ir Vercel/Cloudflare CDN remiasi Content-Type header'iu, ne
 *     path extension'u. Supabase storage grąžina mūsų nustatytą contentType.
 *   - Sutaupom šimtus DB row update'ų ir orphan rizikos.
 *
 * Naudojimas:
 *   # Dry-run (default) — parodys per-failo bytes in/out, jokio realaus upload'o
 *   node scripts/backfill_storage_compress.mjs
 *
 *   # Apply (tikrai overwrite'inti)
 *   node scripts/backfill_storage_compress.mjs --apply
 *
 *   # Filter parametrai
 *   node scripts/backfill_storage_compress.mjs --apply --min-kb 500   # tik >500KB
 *   node scripts/backfill_storage_compress.mjs --apply --limit 50     # max 50 failų
 *
 * ENV: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (iš .env.local)
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { createClient } from '@supabase/supabase-js'

// ── Load .env.local ────────────────────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const envPath = path.resolve(__dirname, '..', '.env.local')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([^=#]+)=(.*)$/)
    if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim()
  }
}

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_BASE || !KEY) {
  console.error('ENV missing: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(URL_BASE, KEY)

// ── CLI args ───────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const MIN_KB = parseInt(args[args.indexOf('--min-kb') + 1] || '100', 10)
const LIMIT = parseInt(args[args.indexOf('--limit') + 1] || '0', 10) || Infinity
const BUCKET = 'covers'

// ── Resize settings (turi atitikti lib/image-resize.ts) ────────────────────
const MAX_DIM = 1920
const WEBP_QUALITY = 80

async function listAllFiles(bucket) {
  const out = []
  let offset = 0
  while (true) {
    const { data, error } = await supabase.storage.from(bucket).list('', {
      limit: 1000, offset, sortBy: { column: 'name', order: 'asc' },
    })
    if (error) throw error
    if (!data || data.length === 0) break
    out.push(...data.filter(x => x.id))
    if (data.length < 1000) break
    offset += 1000
  }
  return out
}

async function downloadFile(bucket, name) {
  const { data, error } = await supabase.storage.from(bucket).download(name)
  if (error) throw error
  return Buffer.from(await data.arrayBuffer())
}

async function resize(buf) {
  const meta = await sharp(buf, { animated: false }).metadata()
  if (meta.pages && meta.pages > 1) {
    // animated — palieka kaip yra
    return { buffer: buf, contentType: `image/${meta.format}`, converted: false }
  }
  let p = sharp(buf, { animated: false }).rotate()
  if ((meta.width || 0) > MAX_DIM || (meta.height || 0) > MAX_DIM) {
    p = p.resize({ width: MAX_DIM, height: MAX_DIM, fit: 'inside', withoutEnlargement: true })
  }
  const output = await p.webp({ quality: WEBP_QUALITY, effort: 4 }).toBuffer()
  return { buffer: output, contentType: 'image/webp', converted: true }
}

function fmtKB(b) { return (b / 1024).toFixed(0) + ' KB' }

async function main() {
  console.log(`== Backfill compress covers bucket (${APPLY ? 'APPLY' : 'DRY-RUN'}) ==`)
  console.log(`Filter: >${MIN_KB} KB, max ${LIMIT === Infinity ? '∞' : LIMIT} files`)

  const all = await listAllFiles(BUCKET)
  const totalMB = all.reduce((s, f) => s + (f.metadata?.size || 0), 0) / 1024 / 1024
  console.log(`Bucket: ${all.length} files, ${totalMB.toFixed(1)} MB`)

  // Filter: jpeg/png > MIN_KB
  const candidates = all
    .filter(f => {
      const m = f.metadata?.mimetype || ''
      const sz = f.metadata?.size || 0
      return (m === 'image/jpeg' || m === 'image/png') && sz >= MIN_KB * 1024
    })
    .sort((a, b) => (b.metadata?.size || 0) - (a.metadata?.size || 0))
    .slice(0, LIMIT)

  const candMB = candidates.reduce((s, f) => s + (f.metadata?.size || 0), 0) / 1024 / 1024
  console.log(`Candidates: ${candidates.length} files, ${candMB.toFixed(1)} MB`)

  let totalIn = 0, totalOut = 0, processed = 0, skipped = 0, failed = 0

  for (const f of candidates) {
    const inSize = f.metadata?.size || 0
    process.stdout.write(`  ${fmtKB(inSize).padStart(8)}  ${f.metadata?.mimetype?.padEnd(10)}  ${f.name}  → `)
    try {
      const buf = await downloadFile(BUCKET, f.name)
      const { buffer: outBuf, contentType, converted } = await resize(buf)

      if (!converted || outBuf.length >= buf.length) {
        console.log(`skip (${fmtKB(outBuf.length)}, ne mažesnis)`)
        skipped++
        continue
      }

      totalIn += inSize
      totalOut += outBuf.length

      if (APPLY) {
        const { error } = await supabase.storage
          .from(BUCKET)
          .upload(f.name, outBuf, { contentType, upsert: true })
        if (error) {
          console.log(`FAIL upload: ${error.message}`)
          failed++
          continue
        }
      }
      processed++
      const reduction = (1 - outBuf.length / inSize) * 100
      console.log(`${fmtKB(outBuf.length).padStart(8)}  -${reduction.toFixed(0)}%`)
    } catch (e) {
      console.log(`FAIL: ${e.message}`)
      failed++
    }
  }

  console.log('\n=== Summary ===')
  console.log(`Processed: ${processed} files`)
  console.log(`Skipped:   ${skipped} files (output not smaller)`)
  console.log(`Failed:    ${failed} files`)
  if (totalIn > 0) {
    console.log(`Bytes in:  ${(totalIn / 1024 / 1024).toFixed(1)} MB`)
    console.log(`Bytes out: ${(totalOut / 1024 / 1024).toFixed(1)} MB`)
    console.log(`Reduction: ${(totalIn - totalOut) / 1024 / 1024} MB (${((1 - totalOut / totalIn) * 100).toFixed(1)}%)`)
  }
  if (!APPLY) console.log('\nDRY-RUN. Paleisk su --apply, kad tikrai overwrite\'intų.')
}

main().catch(e => { console.error(e); process.exit(1) })
