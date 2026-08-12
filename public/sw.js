// 설치 가능(PWA) 조건을 만족시키기 위한 최소 서비스 워커.
//
// 일부러 아무것도 캐싱하지 않는다. Next.js는 빌드마다 해시가 붙은 자산을
// 새로 내보내므로, 어설프게 캐싱하면 배포 직후 옛 청크를 물고 흰 화면이 뜬다.
// 오프라인 지원이 필요해지면 그때 정교하게 설계해서 넣는다.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', () => {
  // 네트워크로 그대로 통과 (respondWith를 호출하지 않으면 브라우저 기본 동작)
});
