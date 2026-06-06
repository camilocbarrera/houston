import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Houston Cloud",
  description: "Your Houston engine, hosted. One box per user.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  // `data-theme="dark"` flips the @houston-ai/core token vars; the `dark` class
  // drives Tailwind's `dark:` utility variant. Match the desktop dark theme.
  return (
    <html lang="en" data-theme="dark" className="dark">
      <body>{children}</body>
    </html>
  );
}
