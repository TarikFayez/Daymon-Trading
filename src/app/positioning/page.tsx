import { MetalCard, PerpCard } from "@/components/positioning/Panels";
import { Hero } from "@/components/ui";
import { compactMoney, pct } from "@/lib/format";
import { providers } from "@/lib/providers";

export const dynamic = "force-dynamic";

export default async function PositioningPage() {
  const [perp, metal] = await Promise.all([
    providers.positioning.getPerp("XRPUSDT"),
    providers.positioning.getMetal("XAGUSD"),
  ]);

  const negativeSettlements = perp.fundingSeries
    .slice(-6)
    .filter((point) => point.value < 0).length;

  return (
    <>
      <Hero
        label="XRP perp funding · 8h"
        value={pct(perp.funding, 4)}
        sub={
          <>
            {perp.funding < 0 ? "Shorts paying longs" : "Longs paying shorts"} ·{" "}
            {negativeSettlements} of the last 6 settlements negative · OI{" "}
            {compactMoney(perp.openInterest)}
          </>
        }
      />

      <div className="flex flex-col gap-4">
        <PerpCard data={perp} />
        <MetalCard data={metal} />
      </div>
    </>
  );
}
