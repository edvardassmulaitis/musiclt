import NextAuth from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      email: string
      name?: string | null
      image?: string | null
      role: 'user' | 'admin' | 'super_admin' | 'moderator'
      /** true kai super_admin šiuo metu impersonuoja kitą vartotoją */
      impersonating?: boolean
    }
    /** Originalaus super_admin'o el. paštas impersonation metu (kitaip null) */
    impersonatorEmail?: string | null
  }

  interface User {
    role?: 'user' | 'admin' | 'super_admin' | 'moderator'
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    role: 'user' | 'admin' | 'super_admin' | 'moderator'
    /** Originali super_admin tapatybė impersonation metu */
    impersonator?: {
      id: string
      role: 'user' | 'admin' | 'super_admin' | 'moderator'
      email?: string | null
      name?: string | null
      picture?: string | null
    }
  }
}
