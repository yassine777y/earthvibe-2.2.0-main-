import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Unbounded, Inter, Noto_Sans_Arabic } from "next/font/google";
import "./globals.css";
import "./creative.css";

const display = Unbounded({ subsets: ["latin"], variable: "--font-display", display: "swap" });
const arabic = Noto_Sans_Arabic({ subsets: ["arabic"], variable: "--font-arabic", display: "swap" });
const body = Inter({ subsets: ["latin"], variable: "--font-body", display: "swap" });

export const metadata: Metadata = {
  title: "Earth Jukebox — hear NASA Earth data",
  description:
    "Accessible, multilingual sonification of real NASA Earth data (GISTEMP, sea ice, ocean imagery). Independent student project — not an official NASA product.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#05080F" },
    { media: "(prefers-color-scheme: light)", color: "#F4EDE1" },
  ],
};

const themeScript = `(function(){try{var s=localStorage.getItem('earthjukebox.theme');var t=s==='light'||s==='dark'?s:(window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark');document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" dir="ltr" data-theme="dark" suppressHydrationWarning className={`${display.variable} ${body.variable} ${arabic.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
