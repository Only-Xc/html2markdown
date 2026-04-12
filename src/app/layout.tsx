import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "html2md — HTML to Markdown Converter",
  description: "Convert HTML to Markdown instantly with a beautiful interactive editor",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="antialiased">{children}</body>
    </html>
  );
}
