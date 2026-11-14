import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Field Shift - crop rotation decisions from NASA data and real soil tests",
  description:
    "Field Shift helps farmers in Kenya and East Africa plan crop rotations using NASA Earth observations and verified soil measurements.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
