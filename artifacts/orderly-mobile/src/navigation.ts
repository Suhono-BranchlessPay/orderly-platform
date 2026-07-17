export type MainTabParamList = {
  Home: undefined;
  Explore: undefined;
  Orders: undefined;
  Profile: undefined;
};

export type RootStackParamList = {
  MainTabs: undefined;
  Cart: undefined;
  Checkout: undefined;
  Restaurant: undefined;
  Confirmation: {
    orderId: string;
    /** Optional: absent when opened from a "ready" push tap (fetched on mount). */
    total?: number | null;
    bpExplorerUrl?: string | null;
    bpAnchorStatus?: string | null;
    chainTxHash?: string | null;
    initialStatus?: string | null;
  };
  /** Human-readable pickup receipt (no chain explorer). */
  Receipt: { orderId: string };
};
