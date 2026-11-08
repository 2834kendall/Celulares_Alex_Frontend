import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  distDir: process.env.SGRH_E2E === '1' ? '.e2e/next' : '.next',
  typescript: process.env.SGRH_E2E === '1' ? { tsconfigPath: 'tsconfig.e2e.json' } : {},
  /* config options here */
  allowedDevOrigins: ['172.30.208.1'],
  experimental: {
    serverActions: {
      // Los archivos del modulo de storage (SGRH-60) viajan por FormData a
      // Server Actions; el default (1 MB) no alcanza. Margen sobre el maximo
      // real por archivo (10 MB en documentos, fase 1B) + overhead multipart.
      bodySizeLimit: '12mb',
    },
  },
}

export default nextConfig
