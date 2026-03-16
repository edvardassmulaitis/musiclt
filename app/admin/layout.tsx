import AdminHeader from '@/components/admin-header'
import { BackgroundTaskProvider } from '@/components/BackgroundTaskContext'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <BackgroundTaskProvider>
      <AdminHeader />
      <main>{children}</main>
    </BackgroundTaskProvider>
  )
}
