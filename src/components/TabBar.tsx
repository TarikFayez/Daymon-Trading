"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/positions", label: "Positions" },
  { href: "/journal", label: "Journal" },
  { href: "/positioning", label: "Positioning" },
  { href: "/chart", label: "Chart" },
  { href: "/strategy", label: "Strategy" },
  { href: "/terminal", label: "Terminal" },
] as const;

/** The only navigation in the app. Active pill is white; the rest recede. */
export function TabBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Panels"
      className="flex flex-wrap gap-2 py-3"
    >
      {TABS.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={[
              "shrink-0 rounded-full px-4 py-2 text-[15px] font-medium transition-colors",
              active
                ? "bg-ink text-canvas"
                : "bg-surface text-muted hover:text-ink",
            ].join(" ")}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
