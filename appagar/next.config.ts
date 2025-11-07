import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'export',
  images: { unoptimized: true },
  basePath: '/appagar', // 👈 usa el nombre real de tu repo en GitHub
};

export default nextConfig;
