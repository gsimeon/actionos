import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ActionOS Renew | AI-Powered Business Execution",
  description:
    "Autonomous execution engine for vehicle insurance renewals. Integrates N-ATLAS multilingual voice, deterministic guardrails, human authorization gates, Paystack settlement, and cryptographic audit ledgers.",
  applicationName: "ActionOS Renew",
  keywords: [
    "ActionOS",
    "Insurance Renewal",
    "Autonomous AI",
    "N-ATLAS",
    "NITDA 2026",
    "Paystack",
    "NAICOM",
    "Audit Ledger",
    "Fintech Nigeria",
  ],
  authors: [{ name: "ActionOS Engineering" }],
  creator: "ActionOS",
  openGraph: {
    type: "website",
    locale: "en_NG",
    url: "https://actionos-gray.vercel.app",
    title: "ActionOS Renew | AI-Powered Business Execution",
    description:
      "AI that doesn't just understand. It acts. Autonomous execution platform with multilingual voice, human authorization gates, and cryptographic auditability.",
    siteName: "ActionOS Renew",
  },
  twitter: {
    card: "summary_large_image",
    title: "ActionOS Renew | AI-Powered Business Execution",
    description:
      "AI that doesn't just understand. It acts. Autonomous execution platform with multilingual voice, human authorization gates, and cryptographic auditability.",
  },
  icons: {
    icon: "/favicon.ico",
  },
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js').catch(function(err) {
                    console.warn('[ActionOS SW] Registration skipped:', err);
                  });
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
