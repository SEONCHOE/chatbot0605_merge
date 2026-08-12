'use client';

import { useEffect } from 'react';
import { SessionProvider } from 'next-auth/react';

export default function Providers({ children }: { children: React.ReactNode }) {
  // 서비스 워커는 PWA 설치(홈 화면에 추가) 조건을 채우기 위한 것.
  // 캐싱은 하지 않는다 — public/sw.js 참고.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') return;
    navigator.serviceWorker.register('/sw.js').catch(() => { /* 등록 실패는 무시 */ });
  }, []);

  return <SessionProvider>{children}</SessionProvider>;
}
