import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "베이비로그 — 아기 돌봄 일지",
  description: "아기 수면, 수유, 기저귀, 건강, 발달을 기록하는 스마트 육아 일지",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full">
      <body className="h-full" suppressHydrationWarning>{children}</body>
    </html>
  );
}
