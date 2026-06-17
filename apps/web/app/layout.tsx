import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";
import { Providers } from "./providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://soriopay.com"),
  title: {
    default: "Sorio — Recurring Payments & Payroll on Solana",
    template: "%s · Sorio",
  },
  description:
    "Non-custodial recurring payments and payroll on Solana. Approve once on-chain, get paid every cycle in USDC. No cards, no banks, no custody.",
  keywords: [
    "Solana payments",
    "crypto subscriptions",
    "on-chain payroll",
    "USDC recurring payments",
    "non-custodial billing",
    "recurring crypto payments",
  ],
  openGraph: {
    type: "website",
    siteName: "Sorio",
    title: "Sorio — Recurring Payments & Payroll on Solana",
    description:
      "Approve once on-chain, get paid on repeat. Non-custodial recurring payments and payroll in USDC, live on Solana mainnet.",
    url: "https://soriopay.com",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Sorio" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Sorio — Recurring Payments & Payroll on Solana",
    description:
      "Approve once on-chain, get paid on repeat. Non-custodial, in USDC, live on Solana mainnet.",
    images: ["/og-image.png"],
  },
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const theme = cookieStore.get("paylo-theme")?.value === "light" ? "light" : "dark";

  return (
    <html
      lang="en"
      data-theme={theme}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Providers initialTheme={theme}>{children}</Providers>
      </body>
    </html>
  );
}