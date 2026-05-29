import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Gaegu } from "next/font/google";

const gaegu = Gaegu({ weight: ['400', '700'], subsets: ['latin'], display: 'swap', variable: '--font-gaegu' });

export const metadata: Metadata = {
  title: "채아의 기록",
  description: "채아의 수면, 수유, 기저귀, 건강, 발달을 기록하는 육아 일지",
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
    <html lang="ko" className={`h-full ${gaegu.variable}`}>
      <body className="h-full" suppressHydrationWarning>{children}</body>
    </html>
  );
}
