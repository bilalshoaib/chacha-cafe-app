/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      {
        source: '/staff',
        destination: '/settings/team',
        permanent: true,
      },
    ]
  },
}

export default nextConfig
