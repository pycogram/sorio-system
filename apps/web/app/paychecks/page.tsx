"use client";

import { AppShell } from "../app-shell";
import { PaychecksList } from "../payroll/paychecks-list";

export default function PaychecksPage() {
  return (
    <AppShell>
      <PaychecksList />
    </AppShell>
  );
}