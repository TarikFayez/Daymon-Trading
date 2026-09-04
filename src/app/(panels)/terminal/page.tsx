import { TerminalFeed } from "@/components/terminal/TerminalFeed";
import { Hero } from "@/components/ui";
import { since } from "@/lib/format";
import { providers } from "@/lib/providers";

export const dynamic = "force-dynamic";

export default async function TerminalPage() {
  const events = await providers.terminal.feed({ sinceHours: 36 });

  const dayAgo = Date.now() - 24 * 3_600_000;
  const last24h = events.filter((e) => new Date(e.time).getTime() >= dayAgo);
  const touching = last24h.filter((e) => e.touches.length > 0);
  const high = touching.filter((e) => e.impact === "HIGH").length;
  const latest = events[0];

  return (
    <>
      <Hero
        label="Hitting open positions · 24h"
        value={String(touching.length)}
        sub={
          <>
            {high} high impact · {last24h.length} on the tape
            {latest ? ` · latest ${since(latest.time)}` : ""}
          </>
        }
      />
      <TerminalFeed events={events} />
    </>
  );
}
