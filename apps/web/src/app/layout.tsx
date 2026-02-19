import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Agent Passport & x402 Gateway",
  description: "Kite agent commerce reference implementation",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
