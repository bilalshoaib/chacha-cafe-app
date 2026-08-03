/** @type {import('next').NextConfig} */
const nextConfig = {
  // runMigrations() reads migrations/*.sql at runtime via a computed path, which
  // Next's file tracing can't see — so the .sql files were left out of the
  // serverless bundle and every migration silently failed on Vercel with ENOENT.
  outputFileTracingIncludes: {
    '/**': ['./migrations/**'],
  },

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
