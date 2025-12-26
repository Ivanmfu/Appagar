/** @type {import('next').NextConfig} */
const nextConfig = {
  // Removed 'output: export' to enable API routes for Vercel deployment
  images: {
    unoptimized: true,
  },
  // Removed basePath and assetPrefix for Vercel deployment
  // These were needed for GitHub Pages subdirectory deployment
};

export default nextConfig;
