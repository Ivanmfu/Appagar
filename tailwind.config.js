/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Colores base
        'app-bg': '#F5F7FA',
        'app-bg-soft': '#E8ECF5',
        'text-primary': '#1A1A1A',
        'text-secondary': '#5A5A5A',
        'border-subtle': '#DCE3F0',

        // Colores de estado y acentos
        'primary': '#246BFD',
        'primary-hover': '#1D57CC',
        'primary-soft': '#DCEAFF',

        'success': '#2E7D32',
        'success-soft': '#C8F2D4',

        'danger': '#E57373',
        'danger-soft': '#FFD3D3',

        'muted-bg': '#EFF2F9',
        'input-border': '#CCD6EB',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
