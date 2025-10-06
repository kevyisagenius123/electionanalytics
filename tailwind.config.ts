import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: 'class',
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
    "./index.html",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'ui-sans-serif', 'Helvetica', 'Arial', 'sans-serif']
      },
      colors: {
        brand: {
          50:'#eff6ff',100:'#dbeafe',200:'#bfdbfe',300:'#93c5fd',400:'#60a5fa',500:'#3b82f6',600:'#2563eb',700:'#1d4ed8',800:'#1e40af',900:'#1e3a8a'
        },
        accent: {
          50:'#f5f3ff',100:'#ede9fe',200:'#ddd6fe',300:'#c4b5fd',400:'#a78bfa',500:'#8b5cf6',600:'#7c3aed',700:'#6d28d9',800:'#5b21b6',900:'#4c1d95'
        }
      },
      boxShadow: {
        'brand-sm':'0 1px 2px 0 rgba(0,0,0,0.06), 0 1px 3px 0 rgba(0,0,0,0.1)',
        'brand':'0 2px 6px -1px rgba(0,0,0,0.15), 0 4px 14px -2px rgba(0,0,0,0.2)',
        'glow':'0 0 0 1px rgba(59,130,246,0.35), 0 0 0 4px rgba(59,130,246,0.15)'
      },
      animation: {
        'fade-in':'fadeIn .6s ease forwards',
        'scale-in':'scaleIn .4s ease forwards'
      },
      keyframes: {
        fadeIn: { '0%':{opacity:'0'}, '100%':{opacity:'1'} },
        scaleIn: { '0%':{opacity:'0', transform:'scale(.96)'}, '100%':{opacity:'1', transform:'scale(1)'} }
      }
    },
  },
  plugins: [],
};

export default config;
