import { AuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import { createAdminClient } from '@/lib/supabase'
import { readAnonIdFromCookie, migrateAnonToProfile } from '@/lib/anon-migration'

export const authOptions: AuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    // Facebook pašalintas (2026-06-22): verifikacijos vargas + mažėjantis naudojimas.
  ],

  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },

  callbacks: {
    async signIn({ user, account }) {
      if (!user.email) return false
      const normEmail = user.email.trim().toLowerCase()

      try {
        const supabase = createAdminClient()
        // .limit(1).maybeSingle() — net jei race'as įvyko ir yra dublikatų,
        // pasiimam kanoninę eilutę (ankstesnė versija naudojo .single()
        // kuris išmesdavo error'ą, ir catch'as resetint role į 'user' —
        // taip 2026-05-02 vakarą Edvardas prarado admin teises).
        const { data: candidates } = await supabase
          .from('profiles')
          .select('id, role, created_at, is_claimed, provider, full_name, avatar_url')
          .ilike('email', normEmail)
          .order('created_at', { ascending: true })
          .limit(5)

        // Jei yra kelios eilutės (dėl ankstesnių duplicate'ų prieš cleanup
        // migraciją), pasirenkam tą su admin/super_admin role; jei nėra —
        // seniausią. Cleanup migracija (20260502b) tai sutvarko visiems
        // — bet code'as turi būti resilient bet kuriuo atveju.
        const existing = (candidates || []).sort((a: any, b: any) => {
          const rank = (r: string) => r === 'super_admin' ? 0 : r === 'admin' ? 1 : 2
          return rank(a.role) - rank(b.role)
        })[0]

        if (!existing) {
          const { data: whitelisted } = await supabase
            .from('admin_whitelist')
            .select('role')
            .ilike('email', normEmail)
            .limit(1)
            .maybeSingle()
          const role = whitelisted?.role || (whitelisted ? 'admin' : 'user')
          const { data: newProfile } = await supabase
            .from('profiles')
            .insert({ email: normEmail, full_name: user.name, avatar_url: user.image, role, provider: account?.provider })
            .select('id')
            .single()
          user.role = role
          if (newProfile) user.id = newProfile.id
        } else {
          // Net jei profile.role lygus 'user', re-check'inam admin_whitelist —
          // jei email yra whitelist'e, bet profilis neatnaujintas, force'inam
          // admin. Tai apsaugo nuo recovery scenario, kai admin'o role
          // anksčiau buvo netyčia perrašytas.
          const { data: whitelisted } = await supabase
            .from('admin_whitelist')
            .select('role')
            .ilike('email', normEmail)
            .limit(1)
            .maybeSingle()
          if (whitelisted?.role && existing.role !== whitelisted.role) {
            await supabase.from('profiles').update({ role: whitelisted.role }).eq('id', existing.id)
            user.role = whitelisted.role
          } else {
            user.role = existing.role
          }
          user.id = existing.id

          // ── Legacy profilio perėmimas (claim) ──────────────────────────
          // Jei prisijungiama prie SENO (legacy_forum) profilio, kuriam admin
          // priskyrė realų el. paštą, bet jis dar neperimtas — pažymim perimtą,
          // perrašom provider'į ir užpildom avatar/vardą iš social paskyros.
          // Username + visa sena veikla jau yra šiame profilyje (auto-reclaim).
          // Fire-and-forget: klaida neblokuoja prisijungimo.
          if (existing.is_claimed !== true && existing.provider === 'legacy_forum') {
            try {
              const patch: Record<string, any> = {
                is_claimed: true,
                provider: account?.provider || 'email',
              }
              if (!existing.full_name && user.name) patch.full_name = user.name
              if (!existing.avatar_url && user.image) patch.avatar_url = user.image
              await supabase.from('profiles').update(patch).eq('id', existing.id)
              console.log(`[legacy-claim] ${normEmail} perėmė legacy profilį ${existing.id}`)
            } catch (e: any) {
              console.error('[legacy-claim] non-fatal:', e?.message || e)
            }
          }
        }

        // Migrate any anonymous signals this device has accumulated into the
        // now-authenticated profile. Safe/idempotent — re-runs on every sign-in
        // and skips anything already migrated. Fire-and-forget style: errors
        // are logged but don't block the sign-in.
        if (user.id) {
          try {
            const anonId = await readAnonIdFromCookie()
            if (anonId) {
              // Get the username to pass to migrateAnonToProfile (unified likes requires user_username)
              const { data: profileData } = await supabase
                .from('profiles')
                .select('username')
                .eq('id', user.id)
                .single()
              const userUsername = profileData?.username || `user_${(user.id as string).substring(0, 8)}`
              const summary = await migrateAnonToProfile(anonId, user.id as string, userUsername)
              if (summary.artistLikes > 0) {
                console.log(`[anon-migration] ${user.email}: migrated ${summary.artistLikes} artist like(s)`)
              }
            }
          } catch (e: any) {
            console.error('[anon-migration] non-fatal error:', e?.message || e)
          }
        }
      } catch (error) {
        console.error('Supabase error:', error)
        user.role = 'user'
      }
      return true
    },

    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id
        token.role = (user as any).role || 'user'
        token.email = user.email
        token.name = user.name
        token.picture = user.image
      }

      // ── Impersonation („prisijungti kaip") ─────────────────────────────
      // Super_admin gali laikinai užsidėti bet kurio vartotojo tapatybę.
      // Trigger'inama iš kliento per useSession().update({ impersonate: <id|null> }).
      // Originali super_admin tapatybė saugoma token.impersonator — pagal ją
      // (a) atstatom paskyrą sustabdžius, (b) autorizuojam patį veiksmą, kad
      // impersonuojamas user'is negalėtų toliau hop'inti į kitą paskyrą.
      if (trigger === 'update' && session && 'impersonate' in session) {
        const target = (session as any).impersonate as string | null
        // Tikra (ne impersonuota) rolė: jei jau impersonuojam — impersonator'io.
        const realRole = (token.impersonator as any)?.role ?? token.role
        if (!target) {
          // Stop — atstatom originalią tapatybę.
          if (token.impersonator) {
            const imp = token.impersonator as any
            token.id = imp.id
            token.role = imp.role
            token.email = imp.email
            token.name = imp.name
            token.picture = imp.picture
            delete (token as any).impersonator
          }
        } else if (realRole === 'super_admin') {
          try {
            const supabase = createAdminClient()
            const { data } = await supabase
              .from('profiles')
              .select('id, role, email, full_name, avatar_url')
              .eq('id', target)
              .maybeSingle()
            if (data) {
              // Užfiksuojam originalą tik pirmą kartą (kad re-impersonate
              // neperrašytų super_admin'o impersonuojamu user'iu).
              if (!token.impersonator) {
                token.impersonator = {
                  id: token.id,
                  role: token.role,
                  email: token.email,
                  name: token.name,
                  picture: token.picture,
                }
              }
              token.id = data.id
              token.role = data.role
              token.email = data.email
              token.name = data.full_name
              token.picture = data.avatar_url
              console.log(`[impersonation] ${(token.impersonator as any).email} → ${data.email}`)
            }
          } catch (e: any) {
            console.error('[impersonation] error:', e?.message || e)
          }
        }
        return token
      }

      if (!token.role && token.email) {
        try {
          const supabase = createAdminClient()
          const normEmail = (token.email as string).trim().toLowerCase()
          // .limit(1).maybeSingle() — saugus jei kažkokiu būdu yra duplikatų
          const { data } = await supabase
            .from('profiles')
            .select('role, id, full_name, avatar_url')
            .ilike('email', normEmail)
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle()
          if (data) {
            token.role = data.role
            token.id = data.id
            if (!token.name) token.name = data.full_name
            if (!token.picture) token.picture = data.avatar_url
          }
        } catch {}
      }
      return token
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        session.user.role = token.role as any
        session.user.email = token.email as string
        session.user.name = token.name as string
        session.user.image = token.picture as string
        // Impersonation būsena — kad UI galėtų rodyti juostą ir „grįžti" mygtuką.
        session.user.impersonating = !!token.impersonator
        session.impersonatorEmail = (token.impersonator as any)?.email ?? null
      }
      return session
    },
  },

  session: { strategy: 'jwt', maxAge: 30 * 24 * 60 * 60 },
  secret: process.env.NEXTAUTH_SECRET || 'kjcxLaUePrIgs0SM6C6yen/Whkp87MDKywsUjmrBPYE=',
  debug: false,
}
