import NextAuth from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      email: string
      name?: string | null
      image?: string | null
      role: 'user' | 'admin' | 'super_admin' | 'moderator'
    }
  }

  interface User {
    role?: 'user' | 'admin' | 'super_admin' | 'moderator'
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    role: 'user' | 'admin' | 'super_admin' | 'moderator'
  }
}
