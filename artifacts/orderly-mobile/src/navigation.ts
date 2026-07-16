export type RootStackParamList = {
  Home: undefined;
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
};
