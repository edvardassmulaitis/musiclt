import Link from 'next/link'

export default function EmptyStudio() {
  return (
    <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-8 text-center">
      <div className="text-4xl">🎤</div>
      <h2 className="mt-3 font-['Outfit',sans-serif] text-xl font-bold text-[var(--text-primary)]">
        Dar nevaldai nė vieno atlikėjo
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-[var(--text-secondary)]">
        Pasiimk savo atlikėjo profilį — sutvarkyk bio ir nuorodas, augink fanų ratą,
        siųsk jiems naujienas ir matyk, kas tave klauso.
      </p>
      <Link
        href="/atlikejams/studija/prisijungti"
        className="mt-4 inline-block rounded-full bg-[var(--accent-orange)] px-5 py-2.5 text-sm font-semibold text-white"
      >
        Pasiimti profilį
      </Link>
    </div>
  )
}
