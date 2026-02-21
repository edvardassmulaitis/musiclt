import NextAuth, { AuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import FacebookProvider from 'next-auth/providers/facebook'
import EmailProvider from 'next-auth/providers/email'
import { createAdminClient } from '@/lib/supabase'

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
      server: {
        host: process.env.EMAIL_SERVER_HOST || 'smtp.gmail.com',
        port: Number(process.env.EMAIL_SERVER_PORT) || 587,
        auth: {
          user: process.env.EMAIL_SERVER_USER,
          pass: process.env.EMAIL_SERVER_PASSWORD,
        },
      },
      from: process.env.EMAIL_FROM || 'noreply@music.lt',
    }),
  ],

  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
    verifyRequest: '/auth/verify',
  },

  callbacks: {
    async signIn({ user, account }) {
      if (!user.email) return false

      const supabase = createAdminClient()

      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id, role')
        .eq('email', user.email)
        .single()

      if (!existingProfile) {
        const { data: whitelisted } = await supabase
          .from('admin_whitelist')
          .select('email')
          .eq('email', user.email)
          .single()

        const role = whitelisted ? 'admin' : 'user'

        await supabase.from('profiles').upsert({
          id: user.id,
          email: user.email,
          full_name: user.name,
          avatar_url: user.image,
          role,
          provider: account?.provider,
        })

        user.role = role
      } else {
        user.role = existingProfile.role
      }

      return true
    },

    async jwt({ token, user, trigger }) {
      if (user) {
        token.id = user.id
        token.role = user.role || 'user'
      }

      if (trigger === 'update' || (!token.role && token.email)) {
        const supabase = createAdminClient()
        const { data } = await supabase
          .from('profiles')
          .select('role, id')
          .eq('email', token.email)
          .single()

        if (data) {
          token.role = data.role
          token.id = data.id
        }
      }

      return token
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id
        session.user.role = token.role
      }
      return session
    },
  },

  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60,
  },

  secret: process.env.NEXTAUTH_SECRET,
}

const handler = NextAuth(authOptions)
export { handler as GET, handler as POST }
