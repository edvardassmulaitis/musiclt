import { AuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import FacebookProvider from 'next-auth/providers/facebook'
import EmailProvider from 'next-auth/providers/email'
import { createAdminClient } from '@/lib/supabase'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export const authOptions: AuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    FacebookProvider({
      clientId: process.env.FACEBOOK_CLIENT_ID!,
      clientSecret: process.env.FACEBOOK_CLIENT_SECRET!,
    }),
    EmailProvider({
      from: process.env.EMAIL_FROM || 'onboarding@resend.dev',
      async sendVerificationRequest({ identifier: email, url }) {
        await resend.emails.send({
          from: process.env.EMAIL_FROM || 'onboarding@resend.dev',
          to: email,
          subject: 'Prisijungimas prie music.lt',
          html: `
            <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:40px 20px;">
              <h1 style="font-size:28px;font-weight:900;margin-bottom:4px;">
                <span style="color:#1a73e8">music</span><span style="color:#f97316">.lt</span>
              </h1>
              <p style="color:#666;margin-bottom:32px;">Didziausia lietuviskos muzikos portalas</p>
              <h2 style="font-size:20px;margin-bottom:8px;">Prisijungimo nuoroda</h2>
              <p style="color:#444;margin-bottom:24px;">Spauskite mygtuka zemiau noredami prisijungti. Nuoroda galioja 24 valandas.</p>
              <a href="${url}" style="display:inline-block;background:linear-gradient(135deg,#1a73e8,#f97316);color:white;font-weight:700;padding:14px 32px;border-radius:12px;text-decoration:none;font-size:16px;">
                Prisijungti prie music.lt
              </a>
              <p style="color:#999;font-size:12px;margin-top:32px;">
                Jei neregistravotes music.lt, ignoruokite si laiska.<br/>
                Nuoroda baigs galioti po 24 valandum.
              </p>
            </div>
          `,
        })
      },
    }),
  ],

  adapter: {
    async createVerificationToken(token) {
      const supabase = createAdminClient()
      await supabase.from('verification_tokens').insert({
        identifier: token.identifier,
        token: token.token,
        expires: token.expires.toISOString(),
      })
      return token
    },
    async useVerificationToken({ identifier, token }) {
      const supabase = createAdminClient()
      const { data } = await supabase
        .from('verification_tokens')
        .select()
        .eq('identifier', identifier)
        .eq('token', token)
        .single()
      if (!data) return null
      await supabase
        .from('verification_tokens')
        .delete()
        .eq('identifier', identifier)
        .eq('token', token)
      return {
        identifier: data.identifier,
        token: data.token,
        expires: new Date(data.expires),
      }
    },
    async getUserByEmail(email) {
      const supabase = createAdminClient()
      const { data } = await supabase
        .from('profiles')
        .select()
        .eq('email', email)
        .single()
      if (!data) return null
      return {
        id: data.id,
        email: data.email,
        name: data.full_name,
        image: data.avatar_url,
        emailVerified: new Date(),
        role: data.role,
      }
    },
    async createUser(user: { email: string; name?: string | null; image?: string | null }) {
      const supabase = createAdminClient()
      const { data: whitelisted } = await supabase
        .from('admin_whitelist')
        .select('role')
        .eq('email', user.email)
        .single()
      const role = whitelisted?.role || (whitelisted ? 'admin' : 'user')
      const { data } = await supabase
        .from('profiles')
        .insert({
          email: user.email,
          full_name: user.name,
          avatar_url: user.image,
          role,
          provider: 'email',
        })
        .select()
        .single()
      return {
        id: data!.id,
        email: data!.email,
        name: data!.full_name,
        image: data!.avatar_url,
        emailVerified: new Date(),
        role: data!.role,
      }
    },
    async getUser(id) {
      const supabase = createAdminClient()
      const { data } = await supabase.from('profiles').select().eq('id', id).single()
      if (!data) return null
      return { id: data.id, email: data.email, name: data.full_name, image: data.avatar_url, emailVerified: new Date(), role: data.role }
    },
    async updateUser(user) { return user as any },
    async linkAccount() { return undefined as any },
    async createSession(session) { return session },
    async getSessionAndUser() { return null },
    async updateSession() { return null },
    async deleteSession() {},
  },

  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
    verifyRequest: '/auth/verify',
  },

  callbacks: {
    async signIn({ user, account }) {
      if (!user.email) return false
      if (account?.provider === 'email') return true

      try {
        const supabase = createAdminClient()
        const { data: existing } = await supabase
          .from('profiles')
          .select('id, role')
          .eq('email', user.email)
          .single()

        if (!existing) {
          const { data: whitelisted } = await supabase
            .from('admin_whitelist')
            .select('role')
            .eq('email', user.email)
            .single()
          const role = whitelisted?.role || (whitelisted ? 'admin' : 'user')
          const { data: newProfile } = await supabase
            .from('profiles')
            .insert({ email: user.email, full_name: user.name, avatar_url: user.image, role, provider: account?.provider })
            .select('id')
            .single()
          user.role = role
          if (newProfile) user.id = newProfile.id
        } else {
          user.role = existing.role
          user.id = existing.id
        }
      } catch (error) {
        console.error('Supabase error:', error)
        user.role = 'user'
      }
      return true
    },

    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = (user as any).role || 'user'
        token.email = user.email
        token.name = user.name
        token.picture = user.image
      }
      if (!token.role && token.email) {
        try {
          const supabase = createAdminClient()
          const { data } = await supabase
            .from('profiles')
            .select('role, id, full_name, avatar_url')
            .eq('email', token.email)
            .single()
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
      }
      return session
    },
  },

  session: { strategy: 'jwt', maxAge: 30 * 24 * 60 * 60 },
  secret: process.env.NEXTAUTH_SECRET || 'kjcxLaUePrIgs0SM6C6yen/Whkp87MDKywsUjmrBPYE=',
  debug: false,
}
