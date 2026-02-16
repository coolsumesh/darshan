import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Darshan — Prototype",
  description: "High-fidelity dashboard UI prototype",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <head>
        <script
          // Set theme as early as possible to avoid a flash.
          dangerouslySetInnerHTML={{
            __html: `(() => {
  try {
    const root = document.documentElement;

    // Load consolidated prefs if present.
    let prefs = null;
    try { prefs = JSON.parse(localStorage.getItem('darshan-ui-prefs') || 'null'); } catch (e) {}

    // Theme (supports Light/Dark/System). Fall back to legacy darshan-theme.
    const legacyTheme = localStorage.getItem('darshan-theme');
    const themePref = (prefs && prefs.theme) ? prefs.theme : (legacyTheme || 'system');
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const resolved = themePref === 'system' ? (prefersDark ? 'dark' : 'light') : themePref;
    if (resolved === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');

    // Font size (rem scaling). Fall back to legacy darshan-font-size.
    const legacySize = localStorage.getItem('darshan-font-size');
    const fontSize = (prefs && prefs.fontSize) ? prefs.fontSize : (legacySize || 'md');
    const map = { sm: 14, md: 16, lg: 18, xl: 20 };
    const px = (fontSize && map[fontSize]) ? map[fontSize] : 16;
    root.style.setProperty('--base-font-size', px + 'px');

    // A11y + layout toggles
    const hc = !!(prefs && prefs.highContrast);
    const rm = !!(prefs && prefs.reducedMotion);
    const sfi = prefs && typeof prefs.showFocusIndicators === 'boolean' ? prefs.showFocusIndicators : true;
    const density = (prefs && prefs.density) ? prefs.density : 'comfortable';

    root.classList.toggle('hc', hc);
    root.classList.toggle('reduce-motion', rm);
    root.classList.toggle('no-focus', !sfi);
    root.classList.toggle('density-compact', density === 'compact');
    root.classList.toggle('density-comfortable', density !== 'compact');

    // Accent (optional)
    const accent = (prefs && prefs.accent) ? prefs.accent : 'blue';
    const accents = {
      blue: { a500: '59 130 246', a600: '37 99 235', a700: '29 78 216' },
      violet: { a500: '139 92 246', a600: '124 58 237', a700: '109 40 217' },
      emerald: { a500: '16 185 129', a600: '5 150 105', a700: '4 120 87' },
      amber: { a500: '245 158 11', a600: '217 119 6', a700: '180 83 9' },
    };
    const acc = accents[accent] || accents.blue;
    root.style.setProperty('--accent-500', acc.a500);
    root.style.setProperty('--accent-600', acc.a600);
    root.style.setProperty('--accent-700', acc.a700);
  } catch (e) {}
})();`,
          }}
        />
      </head>
      <body
        className={`${inter.variable} h-full bg-[rgb(var(--background))] text-[rgb(var(--foreground))]`}
      >
        {children}
      </body>
    </html>
  );
}
