"use client";

import { AppShell } from "../app-shell";
import { SubscriptionsMine } from "../dashboard/subscriptions-mine";

export default function SubscriptionsPage() {
  return (
    <AppShell>
      <SubscriptionsMine />
    </AppShell>
  );
}