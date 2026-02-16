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
    const stored = localStorage.getItem('darshan-theme');
    const theme = stored ?? (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    if (theme === 'dark') document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
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
