import AdminHeader from '@/components/admin-header'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AdminHeader />
      <main>{children}</main>
    </>
  )
}
