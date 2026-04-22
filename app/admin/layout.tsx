import AdminHeader from '@/components/admin-header'
import { BackgroundTaskProvider } from '@/components/BackgroundTaskContext'
import AdminThemeForcer from '@/components/AdminThemeForcer'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <BackgroundTaskProvider>
      <AdminThemeForcer />
      <div data-theme="light" style={{ colorScheme: 'light', color: 'var(--text-primary)' }} className="min-h-screen bg-[#f8f7f5]">
        <AdminHeader />
        <main>{children}</main>
      </div>
    </BackgroundTaskProvider>
  )
}
