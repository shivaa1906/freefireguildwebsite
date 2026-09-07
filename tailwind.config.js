/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Tactical dark base
        ink: {
          900: '#05070a',
          800: '#0a0e14',
          700: '#0f141c',
          600: '#161c26',
          500: '#1e2530',
          400: '#2a3340',
          300: '#3a4555',
        },
        // Deep tactical blue
        tactical: {
          900: '#0a1929',
          800: '#0d2138',
          700: '#102a44',
          600: '#163d5c',
          500: '#1c5275',
          400: '#2a6f99',
          300: '#3a8fb8',
          200: '#5ab0d4',
          100: '#8fd0ea',
        },
        // Neon accent - amber/gold for guild identity
        neon: {
          500: '#f5a623',
          400: '#ffbf3d',
          300: '#ffd166',
          200: '#ffe09e',
          600: '#d4881a',
        },
        // Danger/alert
        alert: {
          500: '#ff4444',
          400: '#ff6666',
          600: '#cc3333',
        },
        // Success
        success: {
          500: '#00d97e',
          400: '#33e89a',
          600: '#00b868',
        },
        // Warning
        warning: {
          500: '#ffaa00',
          400: '#ffbf3d',
        },
      },
      fontFamily: {
        display: ['"Orbitron"', 'system-ui', 'sans-serif'],
        heading: ['"Rajdhani"', 'system-ui', 'sans-serif'],
        body: ['"Inter"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      animation: {
        'fade-in': 'fadeIn 0.6s ease-out forwards',
        'fade-in-up': 'fadeInUp 0.7s ease-out forwards',
        'fade-in-down': 'fadeInDown 0.7s ease-out forwards',
        'slide-in-right': 'slideInRight 0.5s ease-out forwards',
        'slide-in-left': 'slideInLeft 0.5s ease-out forwards',
        'scale-in': 'scaleIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
        'scan-line': 'scanLine 2s linear infinite',
        'float': 'float 6s ease-in-out infinite',
        'spin-slow': 'spin 8s linear infinite',
        'grid-move': 'gridMove 20s linear infinite',
        'shimmer': 'shimmer 2s linear infinite',
        'blink': 'blink 1s step-end infinite',
        'particle-rise': 'particleRise 8s linear infinite',
        'glitch': 'glitch 0.3s ease-in-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(30px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeInDown: {
          '0%': { opacity: '0', transform: 'translateY(-30px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(40px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        slideInLeft: {
          '0%': { opacity: '0', transform: 'translateX(-40px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.9)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 20px rgba(245, 166, 35, 0.3)' },
          '50%': { boxShadow: '0 0 40px rgba(245, 166, 35, 0.6)' },
        },
        scanLine: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100vh)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-20px)' },
        },
        gridMove: {
          '0%': { backgroundPosition: '0 0' },
          '100%': { backgroundPosition: '50px 50px' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        blink: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0' },
        },
        particleRise: {
          '0%': { transform: 'translateY(0) scale(1)', opacity: '0' },
          '10%': { opacity: '0.8' },
          '90%': { opacity: '0.3' },
          '100%': { transform: 'translateY(-100vh) scale(0.3)', opacity: '0' },
        },
        glitch: {
          '0%': { transform: 'translate(0)' },
          '20%': { transform: 'translate(-2px, 2px)' },
          '40%': { transform: 'translate(-2px, -2px)' },
          '60%': { transform: 'translate(2px, 2px)' },
          '80%': { transform: 'translate(2px, -2px)' },
          '100%': { transform: 'translate(0)' },
        },
      },
      backgroundImage: {
        'tactical-grid': "linear-gradient(rgba(42, 111, 153, 0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(42, 111, 153, 0.07) 1px, transparent 1px)",
        'radial-glow': 'radial-gradient(circle at center, rgba(245, 166, 35, 0.15) 0%, transparent 70%)',
      },
      backgroundSize: {
        'grid-50': '50px 50px',
      },
    },
  },
  plugins: [],
};
