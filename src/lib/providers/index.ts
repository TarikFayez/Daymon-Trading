import { MockAnnotationProvider } from "@/lib/providers/mock/annotations";
import { MockJournalProvider } from "@/lib/providers/mock/journal";
import { MockMarketDataProvider } from "@/lib/providers/mock/marketData";
import { MockPositioningProvider } from "@/lib/providers/mock/positioning";
import { MockPositionsProvider } from "@/lib/providers/mock/positions";
import type { Providers } from "@/lib/providers/types";

/**
 * The single wiring point.
 *
 * Every page and route handler imports `providers` from here and nothing else.
 * Replacing a mock with a real integration is one line in this file — see the
 * wiring guide in README.md for what each one maps to.
 */
export const providers: Providers = {
  positions: new MockPositionsProvider(),
  marketData: new MockMarketDataProvider(),
  positioning: new MockPositioningProvider(),
  journal: new MockJournalProvider(),
  annotations: new MockAnnotationProvider(),
};

export type { Providers };
