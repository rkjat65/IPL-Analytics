/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: '#0A0A0F',
          card: '#111118',
          'card-hover': '#1A1A24',
          elevated: '#16161F',
        },
        border: {
          subtle: '#1E1E2A',
          active: '#2A2A3A',
        },
        text: {
          primary: '#E8E8ED',
          secondary: '#8888A0',
          muted: '#555566',
        },
        accent: {
          cyan: '#00E5FF',
          magenta: '#FF2D78',
          lime: '#B8FF00',
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
        'glow-cyan': '0 0 20px rgba(0, 229, 255, 0.15)',
        'glow-magenta': '0 0 20px rgba(255, 45, 120, 0.15)',
        'glow-lime': '0 0 20px rgba(184, 255, 0, 0.15)',
        'glow-amber': '0 0 20px rgba(255, 184, 0, 0.15)',
      },
    },
  },
  plugins: [],
}
