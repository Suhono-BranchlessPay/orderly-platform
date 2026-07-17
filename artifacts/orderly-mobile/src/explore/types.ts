/** Tenant-configurable Explore hub content (white-label). */

export type ExploreCoupon = {
  id: string;
  title: string;
  description?: string;
  code: string;
  /** ISO end time — drives countdown when present. */
  endsAt?: string | null;
  segment: "deals" | "partners";
};

export type ExploreEvent = {
  id: string;
  title: string;
  description?: string;
  /** Optional deep path hint, e.g. menu category name. */
  ctaLabel?: string;
  hrefHint?: string;
};

export type ExploreSponsor = {
  id: string;
  name: string;
  blurb?: string;
};

export type ExploreConfig = {
  deals?: ExploreCoupon[];
  partners?: ExploreCoupon[];
  events?: ExploreEvent[];
  sponsors?: ExploreSponsor[];
};
