import type { Metadata, Viewport } from "next";
import "@fontsource-variable/space-grotesk";
import "@fontsource/jetbrains-mono/400.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Eden — AI Operating System",
  description: "Human intention in. Completed outcomes out.",
};

export const viewport: Viewport = {
  themeColor: "#050310",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-display text-ink antialiased">{children}</body>
    </html>
  );
}
