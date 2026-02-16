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
    // Theme
    const storedTheme = localStorage.getItem('darshan-theme');
    const theme = storedTheme ?? (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    if (theme === 'dark') document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');

    // Font size (rem scaling)
    const storedSize = localStorage.getItem('darshan-font-size');
    const map = { sm: 14, md: 16, lg: 18, xl: 20 };
    const px = (storedSize && map[storedSize]) ? map[storedSize] : 16;
    document.documentElement.style.setProperty('--base-font-size', px + 'px');
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
