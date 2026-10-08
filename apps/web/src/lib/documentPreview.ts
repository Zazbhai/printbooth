/**
 * Document Preview Generator
 * Generates crisp SVG document preview pages for the Radial Carousel
 */

export interface DocumentPagePreview {
  id: number;
  url: string;
  title: string;
  pageNumber: number;
  subtitle: string;
  width?: number;
  height?: number;
}

export function generateDocumentPages(fileName: string = 'Document.pdf', pageCount: number = 5): DocumentPagePreview[] {
  const cleanName = fileName.replace(/\.[^/.]+$/, '');

  const createSvgDataUrl = (pageNumber: number, title: string, contentSvg: string) => {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 560" width="420" height="560">
        <defs>
          <linearGradient id="pageGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#ffffff" />
            <stop offset="100%" stop-color="#f8fafc" />
          </linearGradient>
          <filter id="cardShadow" x="-8%" y="-6%" width="116%" height="116%">
            <feDropShadow dx="0" dy="4" stdDeviation="8" flood-color="#000000" flood-opacity="0.45" />
            <feDropShadow dx="0" dy="1" stdDeviation="2" flood-color="#000000" flood-opacity="0.25" />
          </filter>
        </defs>
        
        <!-- Page Background with shadow -->
        <rect width="420" height="560" rx="6" fill="url(#pageGrad)" filter="url(#cardShadow)" />
        <!-- Visible dark border -->
        <rect width="420" height="560" rx="6" fill="none" stroke="#64748b" stroke-width="2" />
        <!-- Inner subtle border accent -->
        <rect x="1" y="1" width="418" height="558" rx="5" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="1" />
        
        <!-- Header Banner -->
        <rect x="30" y="32" width="50" height="8" rx="4" fill="#dc2626" />
        <text x="90" y="40" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="10" font-weight="700" fill="#334155">${title.toUpperCase()}</text>
        <text x="390" y="40" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="10" font-weight="600" fill="#94a3b8" text-anchor="end">PAGE ${pageNumber} OF ${pageCount}</text>
        <line x1="30" y1="52" x2="390" y2="52" stroke="#cbd5e1" stroke-width="1.5" />
        
        <!-- Main Content -->
        ${contentSvg}
        
        <!-- Footer -->
        <line x1="30" y1="518" x2="390" y2="518" stroke="#cbd5e1" stroke-width="1.5" />
        <text x="30" y="534" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="9" font-weight="500" fill="#94a3b8">${cleanName}.pdf</text>
        <text x="390" y="534" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="9" font-weight="600" fill="#64748b" text-anchor="end">PrintBooth Verified</text>
      </svg>
    `.trim();

    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  };

  const pages = [];
  
  for (let i = 1; i <= pageCount; i++) {
    // We cycle through the 5 mock SVGs for variety
    const patternIndex = (i - 1) % 5;
    
    let contentSvg = '';
    let title = '';
    let subtitle = '';

    if (patternIndex === 0) {
      title = 'Cover Page';
      subtitle = 'Title & Overview';
      contentSvg = `
          <rect x="30" y="80" width="180" height="20" rx="4" fill="#0f172a" />
          <rect x="30" y="110" width="120" height="12" rx="3" fill="#64748b" />
          <rect x="30" y="150" width="360" height="140" rx="8" fill="#f1f5f9" />
          <circle cx="210" cy="220" r="38" fill="#dc2626" opacity="0.15" />
          <path d="M195 220 L225 220 M210 205 L210 235" stroke="#dc2626" stroke-width="3" stroke-linecap="round" />
          <text x="210" y="274" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="11" font-weight="600" fill="#475569" text-anchor="middle">PRIMARY DOCUMENT</text>
          <rect x="30" y="320" width="360" height="8" rx="2" fill="#cbd5e1" />
          <rect x="30" y="336" width="320" height="8" rx="2" fill="#e2e8f0" />
      `;
    } else if (patternIndex === 1) {
      title = 'Executive Summary';
      subtitle = 'Brief';
      contentSvg = `
          <rect x="30" y="80" width="150" height="16" rx="4" fill="#1e293b" />
          <rect x="30" y="110" width="360" height="8" rx="2" fill="#cbd5e1" />
          <rect x="30" y="126" width="340" height="8" rx="2" fill="#e2e8f0" />
          <rect x="30" y="175" width="170" height="130" rx="8" fill="#f8fafc" stroke="#e2e8f0" />
          <rect x="220" y="175" width="170" height="130" rx="8" fill="#f8fafc" stroke="#e2e8f0" />
      `;
    } else if (patternIndex === 2) {
      title = 'Architecture Diagrams';
      subtitle = 'System Flow';
      contentSvg = `
          <rect x="30" y="80" width="160" height="16" rx="4" fill="#1e293b" />
          <rect x="30" y="115" width="360" height="175" rx="8" fill="#0f172a" />
          <rect x="80" y="215" width="260" height="40" rx="6" fill="#1e293b" stroke="#334155" />
          <rect x="30" y="315" width="360" height="8" rx="2" fill="#cbd5e1" />
      `;
    } else if (patternIndex === 3) {
      title = 'Data & Analytics';
      subtitle = 'Metrics';
      contentSvg = `
          <rect x="30" y="80" width="140" height="16" rx="4" fill="#1e293b" />
          <rect x="30" y="115" width="360" height="150" rx="6" fill="#f8fafc" stroke="#e2e8f0" />
          <rect x="30" y="115" width="360" height="28" rx="6" fill="#f1f5f9" />
          <line x1="30" y1="172" x2="390" y2="172" stroke="#e2e8f0" />
          <line x1="30" y1="202" x2="390" y2="202" stroke="#e2e8f0" />
      `;
    } else {
      title = 'Conclusion & Signatures';
      subtitle = 'Approvals';
      contentSvg = `
          <rect x="30" y="80" width="160" height="16" rx="4" fill="#1e293b" />
          <rect x="30" y="110" width="360" height="8" rx="2" fill="#cbd5e1" />
          <rect x="30" y="165" width="165" height="110" rx="8" fill="#f8fafc" stroke="#e2e8f0" />
          <rect x="225" y="165" width="165" height="110" rx="8" fill="#f8fafc" stroke="#e2e8f0" />
      `;
    }

    pages.push({
      id: i,
      pageNumber: i,
      title: `Page ${i} — ${title}`,
      subtitle,
      url: createSvgDataUrl(i, title, contentSvg)
    });
  }

  return pages;
}
