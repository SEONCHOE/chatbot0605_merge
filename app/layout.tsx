import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Gaegu } from "next/font/google";
import Providers from "./components/Providers";

const gaegu = Gaegu({ weight: ['400', '700'], subsets: ['latin'], display: 'swap', variable: '--font-gaegu' });

export const metadata: Metadata = {
  title: "아기의 기록",
  description: "아기의 수면, 수유, 기저귀, 건강, 발달을 기록하는 육아 일지",
  manifest: "/manifest.json",
  // 홈 화면에 추가했을 때 주소창 없이 앱처럼 뜨게 한다 (시리 단축어로 여는 경로)
  appleWebApp: {
    capable: true,
    title: "아기기록",
    statusBarStyle: "default",
  },
  icons: {
    icon: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#78C96E",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={`h-full ${gaegu.variable}`}>
      <body className="h-full" suppressHydrationWarning><Providers>{children}</Providers></body>
    </html>
  );
}
