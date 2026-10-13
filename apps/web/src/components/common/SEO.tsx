import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

export interface BreadcrumbItem {
  name: string
  url: string
}

export interface SEOProps {
  title?: string
  description?: string
  canonicalUrl?: string
  noIndex?: boolean
  ogType?: 'website' | 'article'
  ogImage?: string
  breadcrumbs?: BreadcrumbItem[]
  schema?: Record<string, any>
}

const DEFAULT_TITLE = 'PrintBooth'
const DEFAULT_DESCRIPTION =
  "PrintBooth is India's autonomous self-service printing kiosk network. Direct browser upload, instant UPI scan-to-pay, zero-cloud retention, and automatic hardware release in under 90s."
const DEFAULT_OG_IMAGE = 'https://printbooth.co.in/og-image.png'
const BASE_URL = 'https://printbooth.co.in'

export function sanitizeTitleMaxTwoWords(rawTitle?: string): string {
  if (!rawTitle || !rawTitle.trim()) return DEFAULT_TITLE
  // Clean off standard separators like " | PrintBooth", " — ...", etc.
  const stripped = rawTitle.split(/[|—–-]/)[0].trim()
  const clean = stripped || rawTitle.trim()
  const words = clean.split(/\s+/).filter(Boolean)
  if (words.length <= 2) {
    return words.join(' ')
  }
  return words.slice(0, 2).join(' ')
}

function updateMetaTag(attributeName: 'name' | 'property', attributeValue: string, content: string) {
  let element = document.querySelector(`meta[${attributeName}="${attributeValue}"]`) as HTMLMetaElement | null
  if (!element) {
    element = document.createElement('meta')
    element.setAttribute(attributeName, attributeValue)
    document.head.appendChild(element)
  }
  element.setAttribute('content', content)
}

function updateLinkTag(rel: string, href: string) {
  let element = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null
  if (!element) {
    element = document.createElement('link')
    element.setAttribute('rel', rel)
    document.head.appendChild(element)
  }
  element.setAttribute('href', href)
}

export default function SEO({
  title,
  description = DEFAULT_DESCRIPTION,
  canonicalUrl,
  noIndex = false,
  ogType = 'website',
  ogImage = DEFAULT_OG_IMAGE,
  breadcrumbs,
  schema,
}: SEOProps) {
  const location = useLocation()

  useEffect(() => {
    // 1. Dynamic Title Tag (Max 2 words)
    const pageTitle = sanitizeTitleMaxTwoWords(title)
    document.title = pageTitle

    // 2. Canonical URL
    const canonical = canonicalUrl || `${BASE_URL}${location.pathname}`
    updateLinkTag('canonical', canonical)

    // 3. Meta Description
    updateMetaTag('name', 'description', description)

    // 4. Meta Robots
    const robotsValue = noIndex
      ? 'noindex, nofollow'
      : 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1'
    updateMetaTag('name', 'robots', robotsValue)

    // 5. Open Graph Meta Tags
    updateMetaTag('property', 'og:title', pageTitle)
    updateMetaTag('property', 'og:description', description)
    updateMetaTag('property', 'og:url', canonical)
    updateMetaTag('property', 'og:type', ogType)
    updateMetaTag('property', 'og:image', ogImage)
    updateMetaTag('property', 'og:site_name', 'PrintBooth')

    // 6. Twitter Cards
    updateMetaTag('name', 'twitter:title', pageTitle)
    updateMetaTag('name', 'twitter:description', description)
    updateMetaTag('name', 'twitter:image', ogImage)
    updateMetaTag('name', 'twitter:card', 'summary_large_image')

    // 7. Dynamic JSON-LD (BreadcrumbList & Page-specific schema)
    const scriptId = 'dynamic-page-schema'
    let scriptTag = document.getElementById(scriptId) as HTMLScriptElement | null

    const schemaItems: any[] = []

    if (breadcrumbs && breadcrumbs.length > 0) {
      schemaItems.push({
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: breadcrumbs.map((b, idx) => ({
          '@type': 'ListItem',
          position: idx + 1,
          name: b.name,
          item: b.url.startsWith('http') ? b.url : `${BASE_URL}${b.url}`,
        })),
      })
    }

    if (schema) {
      schemaItems.push({
        '@context': 'https://schema.org',
        ...schema,
      })
    }

    if (schemaItems.length > 0) {
      if (!scriptTag) {
        scriptTag = document.createElement('script')
        scriptTag.id = scriptId
        scriptTag.type = 'application/ld+json'
        document.head.appendChild(scriptTag)
      }
      scriptTag.text = JSON.stringify(schemaItems.length === 1 ? schemaItems[0] : schemaItems)
    } else if (scriptTag) {
      scriptTag.remove()
    }

    return () => {
      // Cleanup dynamically injected schema on unmount
      const existingScript = document.getElementById(scriptId)
      if (existingScript) {
        existingScript.remove()
      }
    }
  }, [title, description, canonicalUrl, noIndex, ogType, ogImage, location.pathname, breadcrumbs, schema])

  return null
}
