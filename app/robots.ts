// app/robots.ts — crawlerių taisyklės + sitemap nuoroda.
import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/artist-browse'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Admin, API ir vidiniai endpoint'ai neindeksuojami.
        disallow: ['/admin', '/api/', '/pokalbiai', '/nustatymai'],
      },
    ],
    sitemap: [`${SITE_URL}/sitemap.xml`, `${SITE_URL}/news-sitemap.xml`],
  }
}
