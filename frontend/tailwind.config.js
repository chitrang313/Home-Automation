/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        paper:   '#fafaf7', // slightly-warm off-white background
        ink:     '#1a1d24', // dark slate text
        slate1:  '#f4f4f1', // card surface
        slate2:  '#e9e9e4', // hover / borders
        slate3:  '#d4d4cf', // strong borders
        accent:  '#3b82f6', // primary action (blue-500)
        success: '#10b981', // ON state
        danger:  '#ef4444', // delete / off
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(15, 23, 42, 0.04), 0 4px 12px rgba(15, 23, 42, 0.04)',
      },
    },
  },
  plugins: [],
};
