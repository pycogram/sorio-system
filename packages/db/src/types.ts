export type Merchant = {
  id: string;
  wallet_address: string;
  destination_wallet: string;
  name: string;
  email: string | null;
  created_at: string;
};

export type Plan = {
  id: string;
  merchant_id: string;
  plan_pda: string;
  name: string;
  description: string | null;
  amount: number;
  token_mint: string;
  period_seconds: number;
  active: boolean;
  created_at: string;
};

export type Subscription = {
  id: string;
  plan_id: string;
  subscriber_wallet: string;
  subscription_pda: string;
  status: "active" | "cancelled" | "suspended" | "revoked";
  subscribed_at: string;
  next_collection_at: string;
  last_collection_at: string | null;
};

export type BillingRecord = {
  id: string;
  subscription_id: string;
  amount: number;
  status: "success" | "failed" | "retrying";
  tx_signature: string | null;
  failure_reason: string | null;
  attempted_at: string;
};
