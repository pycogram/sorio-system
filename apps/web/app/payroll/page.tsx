"use client";

import { AppShell } from "../app-shell";
import { PayrollsOwned } from "./payrolls-owned";

export default function PayrollPage() {
  return (
    <AppShell>
      <PayrollsOwned />
    </AppShell>
  );
}