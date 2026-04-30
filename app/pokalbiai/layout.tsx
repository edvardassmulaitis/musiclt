// /pokalbiai layout — full-height be footer'io, kad chat'as dengtų visą
// likusį viewport'o aukštį (header'is virš).

import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Pokalbiai · music.lt',
  description: 'Privačios žinutės ir grupiniai pokalbiai',
}

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ height: 'calc(100vh - 56px)' }}>
      {children}
    </div>
  )
}
