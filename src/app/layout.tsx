import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "DAYEMON",
  description: "Trading operations — positions, journal, positioning, chart, strategy, terminal.",
};

export const viewport: Viewport = {
  themeColor: "#0d0d0d",
  width: "device-width",
  initialScale: 1,
};

/**
 * Root layout is chrome-free. The 680px column lives in `(panels)/layout.tsx`;
 * `/chart` has its own full-bleed layout so the chart can take the viewport.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
