import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { TabBar } from "@/components/TabBar";
import "./globals.css";

export const metadata: Metadata = {
  title: "DAYEMON",
  description: "Trading operations — positions, journal, positioning, chart.",
};

export const viewport: Viewport = {
  themeColor: "#0d0d0d",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh">
        <div className="mx-auto w-full max-w-[680px] px-5 pb-16">
          <header className="pt-6">
            <p className="text-[15px] font-semibold tracking-[0.22em] text-ink">
              DAYEMON
            </p>
            <TabBar />
          </header>
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}
