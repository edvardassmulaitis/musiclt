import ClaimClient from './ClaimClient'

export const dynamic = 'force-dynamic'

export default function StudioClaimPage() {
  return (
    <div className="max-w-2xl">
      <h1 className="font-['Outfit',sans-serif] text-2xl font-extrabold text-[var(--text-primary)]">Pasiimk savo profilį</h1>
      <p className="mt-2 text-sm text-[var(--text-secondary)]">
        Surask save kataloge ir pateik prašymą. Patvirtinę gausi galimybę redaguoti profilį,
        kalbėtis su fanais ir matyti statistiką.
      </p>
      <div className="mt-5"><ClaimClient /></div>
    </div>
  )
}
