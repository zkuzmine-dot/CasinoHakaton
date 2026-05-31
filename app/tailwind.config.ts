import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-space)", "Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
      colors: {
        accent: "#00ff88",
        danger: "#ff4757",
        surface: "#1a1d26",
        bg: "#0d0f14",
      },
      animation: {
        "slide-in": "slide-in 0.3s ease-out",
        shake: "shake 0.5s ease-in-out",
        "crash-flash": "crash-flash 0.8s ease-out forwards",
        "pulse-subtle": "pulse-subtle 1.5s ease-in-out infinite",
      },
      keyframes: {
        "slide-in": {
          from: { opacity: "0", transform: "translateX(20px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        shake: {
          "0%, 100%": { transform: "translateX(0)" },
          "10%, 50%, 90%": { transform: "translateX(-6px)" },
          "30%, 70%": { transform: "translateX(6px)" },
        },
        "crash-flash": {
          "0%": { background: "rgba(255, 71, 87, 0.25)" },
          "100%": { background: "rgba(255, 71, 87, 0)" },
        },
        "pulse-subtle": {
          "0%, 100%": { boxShadow: "0 0 30px rgba(0,255,136,0.4)" },
          "50%": { boxShadow: "0 0 50px rgba(0,255,136,0.7)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
