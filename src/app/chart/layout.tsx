import type { ReactNode } from "react";

import { AppHeader } from "@/components/AppHeader";

/**
 * Full-bleed: the header is one compact line and the chart takes the rest of
 * the viewport, edge to edge, at any width.
 */
export default function ChartLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-dvh flex-col">
      <div className="px-4 pt-3">
        <AppHeader compact />
      </div>
      <main className="min-h-0 flex-1">{children}</main>
    </div>
  );
}
