import type { ReactNode } from "react";

import { AppHeader } from "@/components/AppHeader";

/** The phone-width column every panel except the chart lives in. */
export default function PanelsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[680px] px-5 pb-16">
      <AppHeader />
      <main>{children}</main>
    </div>
  );
}
