/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: {
    unoptimized: true,
  },
  env: {
    NEXT_PUBLIC_BASE_PATH: '/Appagar',
  },
  basePath: '/Appagar',
  assetPrefix: '/Appagar',
};

export default nextConfig;
