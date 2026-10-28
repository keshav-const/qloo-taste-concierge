import type { Metadata } from "next";
import { Instrument_Serif, Inter } from "next/font/google";
import "./globals.css";

const display = Instrument_Serif({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const body = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

const SITE_URL = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "http://localhost:3014";
const DESCRIPTION =
  "An agentic taste concierge: Qloo's Taste AI personalizes your India trip, real creators verify the places.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "TasteTrail — your taste, your India",
  description: DESCRIPTION,
  applicationName: "TasteTrail",
  openGraph: {
    title: "TasteTrail — your taste, your India",
    description: DESCRIPTION,
    siteName: "TasteTrail",
    type: "website",
    locale: "en_IN",
  },
  twitter: {
    card: "summary_large_image",
    title: "TasteTrail — your taste, your India",
    description: DESCRIPTION,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
