import type { Metadata } from "next";
import { Figtree } from "next/font/google";
import "./globals.css";

const figtree = Figtree({
  subsets: ["latin"],
  variable: "--font-figtree",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Mood Mixer",
  description: "Tell it how you are. Get a playlist that actually fits.",
};

/** Set the theme before first paint. Dark unless the OS explicitly asks for light —
 *  this reads as a music app, and a music app is dark by default. */
const noFlash = `(function(){try{var t=localStorage.getItem("mm-theme");if(!t)t=matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";document.documentElement.dataset.theme=t;}catch(e){}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: noFlash }} />
      </head>
      <body className={figtree.variable}>{children}</body>
    </html>
  );
}
