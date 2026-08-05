import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
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
