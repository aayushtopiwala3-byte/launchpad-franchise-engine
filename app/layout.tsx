import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { FilterProvider } from "../lib/state/filters";
import { StoreProvider } from "../lib/state/store";
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
  title: "Launchpad — Franchise Expansion Engine",
  description:
    "Turns a spreadsheet of franchise applications into decisions you can defend: who to approve, where they go, and why.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <StoreProvider>
          <FilterProvider>{children}</FilterProvider>
        </StoreProvider>
      </body>
    </html>
  );
}
