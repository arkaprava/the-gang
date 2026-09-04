import type { Metadata } from "next";
import { JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";

const sans = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

const mono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Nova — Product Delivery Accelerator",
  description:
    "Describe a feature. Nova’s AI squad — Product Owner, Business Analyst, Developer, and QA — plans, builds, and verifies it with human-in-the-loop gates and persistent memory.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`dark ${sans.variable} ${mono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-nova-bg font-sans text-nova-text">{children}</body>
    </html>
  );
}
