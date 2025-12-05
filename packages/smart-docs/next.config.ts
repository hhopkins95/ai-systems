import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  eslint: {
    // Ignore ESLint during builds to avoid deprecated config warnings
    // ESLint can still be run separately with npm run lint
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Type checking is still enforced during build
    ignoreBuildErrors: false,
  },
}

export default nextConfig
