import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "LeadPulse - Find customers who are already looking",
  description:
    "LeadPulse scans Reddit and Hacker News to find high-intent leads, scores them by purchase intent, and helps you craft the perfect reply.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-bg-primary text-text-primary min-h-screen`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
