import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        "lauds-cream": "#FAF8F4",
        "lauds-charcoal": "#2A2520",
        "lauds-champagne": "#A0784A",
        "lauds-champagne-dark": "#7A5A32",
        "lauds-champagne-light": "#C9A97A",
        "lauds-blue": "#16A6EC",
        "lauds-mag": "#E01E8C",
        "lauds-esg": "#4A8F5E",
        "lauds-surface": "#F2EFE9",
        "lauds-border": "#E4DDD2",
        "lauds-muted": "#8A7E72",
        "lauds-secondary": "#4A453F",
      },
      fontFamily: {
        serif: ["var(--font-cormorant)", "Cormorant Garamond", "Georgia", "serif"],
        sans: ["var(--font-jost)", "Jost", "system-ui", "sans-serif"],
      },
      fontSize: {
        "2xs": ["0.625rem", { lineHeight: "0.875rem" }],
      },
      spacing: {
        "safe-bottom": "env(safe-area-inset-bottom)",
        "safe-top": "env(safe-area-inset-top)",
      },
      borderRadius: {
        "4xl": "2rem",
      },
      boxShadow: {
        "lauds-card": "0 2px 16px 0 rgba(42, 37, 32, 0.08)",
        "lauds-elevated": "0 8px 32px 0 rgba(42, 37, 32, 0.12)",
      },
      animation: {
        "fade-in": "fadeIn 0.3s ease-in-out",
        "slide-up": "slideUp 0.3s ease-out",
        "pulse-soft": "pulseSoft 2s ease-in-out infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        pulseSoft: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.6" },
        },
      },
      backgroundImage: {
        "lauds-gradient": "linear-gradient(135deg, #FAF8F4 0%, #F2EFE9 100%)",
        "champagne-gradient":
          "linear-gradient(135deg, #A0784A 0%, #C9A97A 100%)",
      },
    },
  },
  plugins: [],
};

export default config;
