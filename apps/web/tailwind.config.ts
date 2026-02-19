import type { Config } from "tailwindcss";
import forms from "@tailwindcss/forms";
import typography from "@tailwindcss/typography";

export default {
  darkMode: "class",
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      boxShadow: {
        soft:   "0 10px 30px rgba(17, 24, 39, 0.08)",
        softSm: "0 2px 8px rgba(0, 0, 0, 0.06)",
        card:   "0 2px 8px rgba(0, 0, 0, 0.06)",
        "md-soft": "0 4px 16px rgba(0, 0, 0, 0.10)",
      },
      colors: {
        // Semantic aliases
        panel: "rgb(255 255 255)",
        bg:    "rgb(250 250 249)",   // zinc-50
        ink:   "rgb(24 24 27)",      // zinc-900
        muted: "rgb(161 161 170)",   // zinc-400
        line:  "rgb(228 228 231)",   // zinc-200

        // Brand — Violet/Purple palette (Komal UX spec)
        brand: {
          50:  "#F5F3FF",
          100: "#EDE9FE",
          200: "#DDD6FE",
          300: "#C4B5FD",
          400: "#A78BFA",
          500: "#8B5CF6",
          600: "#7C3AED",
          700: "#5B21B6",
          800: "#4C1D95",
          900: "#2D0F5E",
          950: "#1E0A3C",
        },

        // Warm zinc neutrals (not cold slate)
        zinc: {
          50:  "#FAFAF9",
          100: "#F4F4F5",
          200: "#E4E4E7",
          300: "#D4D4D8",
          400: "#A1A1AA",
          500: "#71717A",
          600: "#52525B",
          700: "#3F3F46",
          800: "#27272A",
          900: "#18181B",
          950: "#09090B",
        },
      },
      fontFamily: {
        sans:    ["var(--font-inter)", "ui-sans-serif", "system-ui"],
        display: ["var(--font-display)", "var(--font-inter)", "ui-sans-serif", "system-ui"],
      },
    },
  },
  plugins: [forms, typography],
} satisfies Config;
