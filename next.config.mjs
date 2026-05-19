import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'media.rawg.io' },
      { protocol: 'https', hostname: 'images.igdb.com' },
    ],
  },
  experimental: {
    serverComponentsExternalPackages: ['better-sqlite3', 'sharp'],
    // Ensure the sharp native binaries are included in the standalone output
    outputFileTracingIncludes: {
      '/api/covers': ['./node_modules/sharp/**/*'],
    },
  },
}

export default withNextIntl(nextConfig)
