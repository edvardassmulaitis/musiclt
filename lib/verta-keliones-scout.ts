export async function runScout(_opts: { maxTours?: number; maxCandidates?: number } = {}): Promise<{ tours: number; matched: number; inserted: number; skipped_existing: number; note: string }> {
  return { tours: 0, matched: 0, inserted: 0, skipped_existing: 0, note: 'disabled' }
}
