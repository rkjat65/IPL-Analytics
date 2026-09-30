/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Play K palette: lime on deep green-black (see the logo on crickrida.com/brand/)
        bg: {
          primary: '#0C1210',
          card: '#121A17',
          'card-hover': '#1D2925',
          elevated: '#17211F',
        },
        border: {
          subtle: '#22302B',
          active: '#2E3F39',
        },
        text: {
          primary: '#F3F4EE',
          secondary: '#9AA69F',
          muted: '#7C8983',
        },
        accent: {
          brand: '#C3F23B',
          teal: '#2DD4BF',
          magenta: '#FF2D78',
          amber: '#FFB800',
          purple: '#8B5CF6',
        },
        success: '#22C55E',
        danger: '#EF4444',
        // IPL Team colors
        team: {
          csk: '#FCCA06',
          mi: '#004BA0',
          rcb: '#EC1C24',
          kkr: '#3A225D',
          dc: '#17479E',
          pbks: '#ED1B24',
          rr: '#EA1A85',
          srh: '#FF822A',
          gt: '#1C1C2B',
          lsg: '#A72056',
        },
      },
      fontFamily: {
        heading: ['Space Grotesk', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
        body: ['Inter', 'sans-serif'],
      },
      boxShadow: {
        'glow-brand': '0 0 20px rgba(195, 242, 59, 0.15)',
        'glow-magenta': '0 0 20px rgba(255, 45, 120, 0.15)',
        'glow-teal': '0 0 20px rgba(45, 212, 191, 0.15)',
        'glow-amber': '0 0 20px rgba(255, 184, 0, 0.15)',
      },
    },
  },
  plugins: [],
}
