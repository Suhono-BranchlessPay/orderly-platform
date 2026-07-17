import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Share,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EmptyState } from "../components/ui";
import { loadExploreConfig, exploreHasContent } from "../explore/loadExplore";
import type { ExploreCoupon } from "../explore/types";
import { tenant } from "../tenant";
import { tokens, headingFont, bodyFont } from "../theme/tokens";

type Segment = "deals" | "partners";

function useCountdown(endsAt?: string | null): string | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!endsAt) return;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [endsAt]);
  if (!endsAt) return null;
  const end = new Date(endsAt).getTime();
  if (!Number.isFinite(end) || end <= now) return "Ended";
  const ms = end - now;
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `Ends in ${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m`;
}

function CouponCard({ coupon }: { coupon: ExploreCoupon }) {
  const t = tenant.theme;
  const countdown = useCountdown(coupon.endsAt);
  const [copied, setCopied] = useState(false);

  const copyCode = async () => {
    try {
      await Clipboard.setStringAsync(coupon.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      void Share.share({
        message: `${coupon.title}: use code ${coupon.code}`,
      }).catch(() => undefined);
    }
  };

  return (
    <View style={[styles.card, { backgroundColor: t.surface }]}>
      <Text style={[styles.cardTitle, { color: t.text, fontFamily: headingFont() }]}>
        {coupon.title}
      </Text>
      {coupon.description ? (
        <Text style={[styles.cardBody, { color: t.muted, fontFamily: bodyFont() }]}>
          {coupon.description}
        </Text>
      ) : null}
      {countdown ? (
        <Text
          style={[
            styles.countdown,
            { color: tokens.color.link, fontFamily: bodyFont() },
          ]}
        >
          {countdown}
        </Text>
      ) : null}
      <View style={styles.codeRow}>
        <Text style={[styles.code, { color: t.text, fontFamily: bodyFont() }]}>
          {coupon.code}
        </Text>
        <Pressable
          onPress={() => void copyCode()}
          accessibilityRole="button"
          accessibilityLabel={
            copied ? `Copied code ${coupon.code}` : `Copy code ${coupon.code}`
          }
          style={[
            styles.copyBtn,
            { backgroundColor: copied ? t.accent : t.primary },
          ]}
        >
          <Text style={styles.copyTxt}>{copied ? "Copied!" : "Copy Code"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function ExploreScreen() {
  const insets = useSafeAreaInsets();
  const t = tenant.theme;
  const cfg = useMemo(() => loadExploreConfig(), []);
  const hasContent = exploreHasContent(cfg);
  const hasDeals = (cfg.deals?.length ?? 0) > 0;
  const hasPartners = (cfg.partners?.length ?? 0) > 0;
  const segments = (
    [
      hasDeals ? (["deals", "Deals of the Week"] as const) : null,
      hasPartners ? (["partners", "Partner Promos"] as const) : null,
    ] as const
  ).filter(Boolean) as Array<readonly [Segment, string]>;

  const [segment, setSegment] = useState<Segment>(
    hasDeals ? "deals" : "partners",
  );

  useEffect(() => {
    if (segment === "deals" && !hasDeals && hasPartners) setSegment("partners");
    if (segment === "partners" && !hasPartners && hasDeals) setSegment("deals");
  }, [segment, hasDeals, hasPartners]);

  const coupons =
    segment === "deals" ? cfg.deals ?? [] : cfg.partners ?? [];

  return (
    <View
      style={[
        styles.root,
        { backgroundColor: t.background, paddingTop: insets.top + 8 },
      ]}
    >
      <Text
        style={[styles.title, { color: t.text, fontFamily: headingFont() }]}
        accessibilityRole="header"
      >
        Explore
      </Text>
      <Text style={[styles.sub, { color: t.muted, fontFamily: bodyFont() }]}>
        Deals, local partners, and community events near {tenant.locationLabel ?? "you"}.
      </Text>

      {!hasContent ? (
        <View style={styles.emptyWrap}>
          <EmptyState
            title="No promos yet"
            body="Check back soon for weekly deals and partner offers. Your menu is ready anytime on Home."
          />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{
            paddingBottom: insets.bottom + 24,
            gap: tokens.space.md,
          }}
        >
          {(cfg.events?.length ?? 0) > 0 ? (
            <View>
              <Text
                style={[
                  styles.section,
                  { color: t.text, fontFamily: headingFont() },
                ]}
              >
                Active events
              </Text>
              {cfg.events!.map((ev) => (
                <View
                  key={ev.id}
                  style={[styles.eventCard, { backgroundColor: t.surface }]}
                >
                  <Text
                    style={[
                      styles.cardTitle,
                      { color: t.text, fontFamily: headingFont() },
                    ]}
                  >
                    {ev.title}
                  </Text>
                  {ev.description ? (
                    <Text
                      style={[
                        styles.cardBody,
                        { color: t.muted, fontFamily: bodyFont() },
                      ]}
                    >
                      {ev.description}
                    </Text>
                  ) : null}
                </View>
              ))}
            </View>
          ) : null}

          {segments.length > 0 ? (
            <View style={[styles.seg, { backgroundColor: t.surface }]}>
              {segments.map(([id, label]) => {
                const on = segment === id;
                return (
                  <Pressable
                    key={id}
                    onPress={() => setSegment(id)}
                    style={[
                      styles.segBtn,
                      on && { backgroundColor: t.primary },
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                  >
                    <Text
                      style={{
                        color: on ? "#fff" : t.muted,
                        fontWeight: "700",
                        fontSize: 12,
                        fontFamily: bodyFont(),
                        textAlign: "center",
                      }}
                    >
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {segments.length > 0 ? (
            coupons.length === 0 ? (
              <EmptyState
                title={
                  segment === "deals"
                    ? "No deals this week"
                    : "No partner promos"
                }
                body="New offers will show up here when available."
              />
            ) : (
              coupons.map((c) => <CouponCard key={c.id} coupon={c} />)
            )
          ) : null}

          {(cfg.sponsors?.length ?? 0) > 0 ? (
            <View>
              <Text
                style={[
                  styles.section,
                  { color: t.text, fontFamily: headingFont() },
                ]}
              >
                Local partners
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.sponsorRow}>
                  {cfg.sponsors!.map((s) => (
                    <View
                      key={s.id}
                      style={[
                        styles.sponsorChip,
                        { backgroundColor: t.surface, borderColor: t.muted },
                      ]}
                    >
                      <Text
                        style={{
                          color: t.text,
                          fontWeight: "700",
                          fontFamily: bodyFont(),
                        }}
                      >
                        {s.name}
                      </Text>
                      {s.blurb ? (
                        <Text
                          style={{
                            color: t.muted,
                            fontSize: 11,
                            marginTop: 4,
                            fontFamily: bodyFont(),
                          }}
                          numberOfLines={2}
                        >
                          {s.blurb}
                        </Text>
                      ) : null}
                    </View>
                  ))}
                </View>
              </ScrollView>
            </View>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: tokens.space.md },
  title: { fontSize: 26, fontWeight: "700" },
  sub: { fontSize: 13, marginTop: 4, marginBottom: tokens.space.md },
  emptyWrap: { flex: 1, justifyContent: "center" },
  section: { fontSize: 17, fontWeight: "700", marginBottom: 8 },
  seg: {
    flexDirection: "row",
    borderRadius: tokens.radius.md,
    padding: 4,
    gap: 4,
  },
  segBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: tokens.radius.sm,
  },
  card: {
    borderRadius: tokens.radius.card,
    padding: tokens.space.md,
    gap: 6,
  },
  eventCard: {
    borderRadius: tokens.radius.card,
    padding: tokens.space.md,
    marginBottom: tokens.space.sm,
  },
  cardTitle: { fontSize: 16, fontWeight: "700" },
  cardBody: { fontSize: 13, lineHeight: 18 },
  countdown: { fontSize: 12, fontWeight: "700", marginTop: 4 },
  codeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
    gap: 12,
  },
  code: {
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 1,
  },
  copyBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: tokens.radius.sm,
    minHeight: tokens.touch.min,
    justifyContent: "center",
  },
  copyTxt: { color: "#fff", fontWeight: "800", fontSize: 12 },
  sponsorRow: { flexDirection: "row", gap: 10 },
  sponsorChip: {
    width: 160,
    borderRadius: tokens.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: tokens.space.sm,
  },
});
