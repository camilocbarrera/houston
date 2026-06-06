import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Houston Cloud",
  description: "Your Houston engine, hosted. One box per user.",
};

// Mobile scaling: fit device width, allow pinch-zoom up to 5x for accessibility.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  // Match the desktop default theme: LIGHT. The @houston-ai/core tokens fall back
  // to the `:root` (light) palette when no `data-theme="dark"` is set, and no
  // `dark` class keeps Tailwind's `dark:` variant off — same as the app, whose
  // loadTheme() defaults to "light" unless the user explicitly picked dark.
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
