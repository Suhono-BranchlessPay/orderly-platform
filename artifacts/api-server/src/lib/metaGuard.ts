/**
 * Central guard + throttle for ALL outbound Meta Graph traffic.
 *
 * Why this exists: the Business Manager was restricted by Meta for
 * "automation / Account Integrity" (large amounts of activity created by a
 * machine). To avoid tripping Meta's heuristics again — and to give ops a
 * single panic button while the account is under review — every outbound Graph
 * call (social comment/Messenger replies, comment backfill reads, and CAPI
 * conversion events) funnels through here so it is:
 *
 *   1. Hard-stopped when META_GLOBAL_KILL_SWITCH=1 (one switch stops it all).
 *   2. Spaced by a process-wide minimum gap + random jitter, so a queue flush
 *      never fires dozens of calls back-to-back (which looks like a bot).
 *
 * This is intentionally conservative: replies are still separately human-gated
 * in lib/social.ts; this only adds a global stop + pacing on top.
 */

/** Single env to stop ALL outbound Meta Graph traffic at once. */
export function isMetaGloballyDisabled(): boolean {
  const v = process.env.META_GLOBAL_KILL_SWITCH?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** Minimum ms between the start of any two Meta Graph calls (default 1200). */
function minGapMs(): number {
  const n = Number(process.env.META_MIN_CALL_GAP_MS);
  return Number.isFinite(n) && n >= 0 ? n : 1200;
}

/** Extra random 0..N ms added to each gap so pacing isn't perfectly regular. */
function jitterMs(): number {
  const n = Number(process.env.META_CALL_JITTER_MS);
  return Number.isFinite(n) && n >= 0 ? n : 400;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

// Process-wide serialization: successive calls queue behind one another so the
// spacing below is honored across BOTH social sends and CAPI flushes together.
let chain: Promise<void> = Promise.resolve();
let lastCallAt = 0;

/**
 * Acquire a throttle slot before performing an outbound Meta Graph fetch.
 * Guarantees at least (minGap + [0..jitter]) ms between the start of any two
 * Meta calls in this process. Await this immediately before the fetch.
 *
 * Errors are swallowed on the shared chain so one caller can never wedge the
 * queue for everyone else.
 */
export function throttleMetaCall(): Promise<void> {
  const run = chain.then(async () => {
    const now = Date.now();
    const base = Math.max(0, lastCallAt + minGapMs() - now);
    const wait = base + Math.floor(Math.random() * (jitterMs() + 1));
    if (wait > 0) await sleep(wait);
    lastCallAt = Date.now();
  });
  chain = run.catch(() => {
    /* keep the chain alive even if a slot rejects */
  });
  return run;
}

/** Human-readable status for /healthz-style diagnostics. */
export function metaGuardStatus(): {
  globally_disabled: boolean;
  min_call_gap_ms: number;
  call_jitter_ms: number;
} {
  return {
    globally_disabled: isMetaGloballyDisabled(),
    min_call_gap_ms: minGapMs(),
    call_jitter_ms: jitterMs(),
  };
}
