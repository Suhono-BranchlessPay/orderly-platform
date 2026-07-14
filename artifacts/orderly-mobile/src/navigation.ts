export type RootStackParamList = {
  Home: undefined;
  Cart: undefined;
  Checkout: undefined;
  Restaurant: undefined;
  Confirmation: {
    orderId: string;
    total: number;
    bpExplorerUrl: string | null;
    bpAnchorStatus: string | null;
    chainTxHash: string | null;
    initialStatus?: string | null;
  };
};
