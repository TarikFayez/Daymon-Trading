import { TabBar } from "@/components/TabBar";

/**
 * Wordmark plus the tab bar. `compact` puts them on one line with smaller
 * pills — used on the chart page, where every vertical pixel is chart.
 */
export function AppHeader({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <header className="flex flex-wrap items-center gap-x-4">
        <p className="text-[13px] font-semibold tracking-[0.22em] text-ink">DAYEMON</p>
        <TabBar compact />
      </header>
    );
  }

  return (
    <header className="pt-6">
      <p className="text-[15px] font-semibold tracking-[0.22em] text-ink">DAYEMON</p>
      <TabBar />
    </header>
  );
}
