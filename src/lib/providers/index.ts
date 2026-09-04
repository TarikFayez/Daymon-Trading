import { MockAgentProvider } from "@/lib/providers/mock/agent";
import { MockAnnotationProvider } from "@/lib/providers/mock/annotations";
import { MockExecutionProvider } from "@/lib/providers/mock/execution";
import { MockJournalProvider } from "@/lib/providers/mock/journal";
import { MockMarketDataProvider } from "@/lib/providers/mock/marketData";
import { MockPositioningProvider } from "@/lib/providers/mock/positioning";
import { MockPositionsProvider } from "@/lib/providers/mock/positions";
import { MockStrategyProvider } from "@/lib/providers/mock/strategy";
import { MockTerminalProvider } from "@/lib/providers/mock/terminal";
import type { Providers } from "@/lib/providers/types";

/**
 * The single wiring point.
 *
 * Every page and route handler imports `providers` from here and nothing else.
 * Replacing a mock with a real integration is one line in this file — see the
 * wiring guide in README.md for what each one maps to.
 */
const execution = new MockExecutionProvider();

export const providers: Providers = {
  positions: new MockPositionsProvider(),
  marketData: new MockMarketDataProvider(),
  positioning: new MockPositioningProvider(),
  journal: new MockJournalProvider(),
  annotations: new MockAnnotationProvider(),
  strategies: new MockStrategyProvider(),
  // The agent owns the decision path; execution is injected so the venue can
  // change without the state machine noticing.
  agent: new MockAgentProvider(execution),
  execution,
  terminal: new MockTerminalProvider(),
};

export type { Providers };
