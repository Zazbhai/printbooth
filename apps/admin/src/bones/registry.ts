"use client"
import { registerBones } from 'boneyard-js'

// Export bone datasets for Boneyard CLI and external tooling
export const boneDatasets = {
  "admin-dashboard": {},
  "merchant-dashboard": {},
}

// Boneyard <Skeleton name="..." loading={...} fallback={<...SkeletonFallback />}>
// activates pixel-perfect, tailored dashboard fallbacks matching the exact
// Capitalio theme cards, dimensions, sparklines, charts, and table rows.
registerBones({})
