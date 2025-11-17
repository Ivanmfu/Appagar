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
        'text-primary': '#2A2E37',
        'text-secondary': '#60697B',
        'border-subtle': '#E3E6EB',
        
        // Colores de estado (pastel)
        'primary': '#246BFD',
        'primary-hover': '#1D57CC',
        'primary-soft': '#E8F1FF',
        
        'success': '#43A047',
        'success-soft': '#DFF5E8',
        
        'danger': '#E57373',
        'danger-soft': '#FCE8E8',
        
        'muted-bg': '#F4F5FB',
        'input-border': '#D0D7E2',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
