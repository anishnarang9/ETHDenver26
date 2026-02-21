import "./globals.css";
import type { Metadata } from "next";
import { IBM_Plex_Sans, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import { AmbientBackground } from "../components/ambient-background";
import { AppShell } from "../components/app-shell";

const display = Space_Grotesk({ subsets: ["latin"], variable: "--font-display" });
const body = IBM_Plex_Sans({ subsets: ["latin"], variable: "--font-body", weight: ["400", "500", "600", "700"] });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "TripDesk Mission Control",
  description: "Autonomous agent commerce console on Kite",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>
        <div className="app-root">
          <AmbientBackground />
          <AppShell>{children}</AppShell>
        </div>
      </body>
    </html>
  );
}
