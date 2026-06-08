"use client";

import { Navbar } from "../navbar";
import { PayrollList } from "./payroll-list";

export default function PayrollPage() {
  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Navbar />
      <div className="mx-auto max-w-4xl px-8 py-12">
        <a href="/dashboard" className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]">← Dashboard</a>
        <div className="mt-2"><PayrollList /></div>
      </div>
    </main>
  );
}