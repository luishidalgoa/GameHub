/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'media.rawg.io' },
      { protocol: 'https', hostname: 'images.igdb.com' },
    ],
  },
  experimental: {
    serverComponentsExternalPackages: ['better-sqlite3', 'sharp'],
  },
}

export default nextConfig
