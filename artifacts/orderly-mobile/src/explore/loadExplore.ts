import { tenant } from "../tenant";
import type { ExploreConfig } from "./types";

/**
 * Load Explore hub content from tenant config.
 * Empty / missing → UI shows a friendly empty-state (never a blank tab).
 */
export function loadExploreConfig(): ExploreConfig {
  const raw = tenant.explore;
  if (!raw || typeof raw !== "object") return {};
  return {
    deals: Array.isArray(raw.deals) ? raw.deals : [],
    partners: Array.isArray(raw.partners) ? raw.partners : [],
    events: Array.isArray(raw.events) ? raw.events : [],
    sponsors: Array.isArray(raw.sponsors) ? raw.sponsors : [],
  };
}

export function exploreHasContent(cfg: ExploreConfig): boolean {
  return Boolean(
    (cfg.deals && cfg.deals.length) ||
      (cfg.partners && cfg.partners.length) ||
      (cfg.events && cfg.events.length) ||
      (cfg.sponsors && cfg.sponsors.length),
  );
}
