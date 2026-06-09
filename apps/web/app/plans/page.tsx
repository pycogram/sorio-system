"use client";

import { AppShell } from "../app-shell";
import { PlansOwned } from "../dashboard/plans-owned";

export default function PlansPage() {
  return (
    <AppShell>
      <PlansOwned />
    </AppShell>
  );
}