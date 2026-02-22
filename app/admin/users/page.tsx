'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'

type Profile = {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  role: string
  provider: string | null
  created_at: string
}

export default function AdminUsersPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [users, setUsers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)

  const isSuperAdmin = session?.user?.role === 'super_admin'

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/admin/users')
    const data = await res.json()
    setUsers(data.users || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    if (status === 'loading') return
    if (!session || (session.user?.role !== 'admin' && session.user?.role !== 'super_admin')) {
      router.push('/auth/forbidden')
      return
    }
    fetchUsers()
  }, [status, session?.user?.role])

  const updateRole = async (userId: string, newRole: string) => {
    if (!isSuperAdmin) return
    setUpdating(userId)
    await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, role: newRole }),
    })
    await fetchUsers()
    setUpdating(null)
  }

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-music-blue border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const roleColors: Record<string, string> = {
    super_admin: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    admin: 'bg-music-orange/20 text-music-orange border-music-orange/30',
    moderator: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    user: 'bg-white/5 text-gray-400 border-white/10',
  }

  const roleLabels: Record<string, string> = {
    super_admin: 'Super Admin',
    admin: 'Admin',
    moderator: 'Moderatorius',
    user: 'Narys',
  }

  return (
    <div className="min-h-screen">
      <nav className="border-b border-white/10 bg-black/30 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/admin/dashboard" className="text-gray-400 hover:text-white transition-colors text-sm">Dashboard</Link>
          <span className="text-gray-600">/</span>
          <span className="text-white text-sm font-medium">Vartotojai</span>
        </div>
      </nav>
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Vartotojai</h1>
            <p className="text-gray-400 text-sm mt-1">{users.length} registruoti vartotojai</p>
          </div>
          {!isSuperAdmin && (
            <div className="bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-xs px-3 py-2 rounded-lg">
              Tik Super Admin gali keisti roles
            </div>
          )}
        </div>
        <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium uppercase tracking-wider">Vartotojas</th>
                <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium uppercase tracking-wider hidden sm:table-cell">Provider</th>
                <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium uppercase tracking-wider">Role</th>
                {isSuperAdmin && <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium uppercase tracking-wider">Keisti</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-white/3 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {user.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={user.avatar_url} alt="" width={32} height={32} className="w-8 h-8 rounded-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-music-blue to-music-orange flex items-center justify-center text-xs font-bold text-white">
                          {user.full_name?.[0] || user.email[0].toUpperCase()}
                        </div>
                      )}
                      <div>
                        <div className="text-sm font-medium text-white">{user.full_name || '-'}</div>
                        <div className="text-xs text-gray-400">{user.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <span className="text-xs text-gray-400 capitalize">{user.provider || '-'}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block text-xs px-2 py-1 rounded-full border font-medium ${roleColors[user.role] || roleColors.user}`}>
                      {roleLabels[user.role] || user.role}
                    </span>
                  </td>
                  {isSuperAdmin && (
                    <td className="px-4 py-3">
                      {user.email !== session?.user?.email ? (
                        <select value={user.role} onChange={(e) => updateRole(user.id, e.target.value)} disabled={updating === user.id}
                          className="text-xs bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-white focus:outline-none disabled:opacity-50">
                          <option value="user">Narys</option>
                          <option value="moderator">Moderatorius</option>
                          <option value="admin">Admin</option>
                          <option value="super_admin">Super Admin</option>
                        </select>
                      ) : (
                        <span className="text-xs text-gray-600">Tu pats</span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
