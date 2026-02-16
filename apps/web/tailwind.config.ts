import type { Config } from "tailwindcss";
import forms from "@tailwindcss/forms";
import typography from "@tailwindcss/typography";

export default {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      boxShadow: {
        soft: "0 10px 30px rgba(17, 24, 39, 0.08)",
        softSm: "0 6px 18px rgba(17, 24, 39, 0.08)",
        insetRing: "inset 0 0 0 1px rgba(15, 23, 42, 0.08)",
      },
      borderRadius: {
        xl2: "1.25rem",
      },
      colors: {
        panel: "rgb(255 255 255)",
        bg: "rgb(248 250 252)",
        ink: "rgb(15 23 42)",
        muted: "rgb(100 116 139)",
        line: "rgb(226 232 240)",
        brand: {
          50: "rgb(239 246 255)",
          100: "rgb(219 234 254)",
          200: "rgb(191 219 254)",
          500: "rgb(59 130 246)",
          600: "rgb(37 99 235)",
          700: "rgb(29 78 216)",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui"],
      },
    },
  },
  plugins: [forms, typography],
} satisfies Config;
