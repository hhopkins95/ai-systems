import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Smart Docs",
  description: "Local documentation viewer for AI-native codebases",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
