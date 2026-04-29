import { AuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import FacebookProvider from 'next-auth/providers/facebook'
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
  ],

  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },

  callbacks: {
    async signIn({ user, account }) {
      if (!user.email) return false

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
