"use client"
import { registerBones } from 'boneyard-js'

import _support_page from './support-page.bones.json'
import _request_installation_page from './request-installation-page.bones.json'
import _how_it_works_page from './how-it-works-page.bones.json'
import _features_page from './features-page.bones.json'
import _pricing_page from './pricing-page.bones.json'
import _locations_page from './locations-page.bones.json'
import _faq_page from './faq-page.bones.json'
import _contact_page from './contact-page.bones.json'

// Export bone datasets for Boneyard CLI and external tooling
export const boneDatasets = {
  "support-page": _support_page,
  "request-installation-page": _request_installation_page,
  "how-it-works-page": _how_it_works_page,
  "features-page": _features_page,
  "pricing-page": _pricing_page,
  "locations-page": _locations_page,
  "faq-page": _faq_page,
  "contact-page": _contact_page,
}

// Boneyard <Skeleton name="..." loading={...} fallback={<PageSkeletonFallback />}>
// activates the dedicated, pixel-perfect Neomorphic fallbacks for seamless responsive
// fidelity without vertical scale distortion or stripped container cards.
registerBones({})
