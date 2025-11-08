/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: {
    unoptimized: true,
  },
  // Usa el nombre real del repositorio cuando despliegues en GitHub Pages.
  // Comentado para desarrollo local - descomenta para GitHub Pages
  // basePath: process.env.NEXT_PUBLIC_BASE_PATH ?? '/appagar',
};

export default nextConfig;
