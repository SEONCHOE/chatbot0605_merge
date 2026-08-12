'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// ── Web Speech API 타입 (TypeScript 5.9 DOM lib에 아직 없음) ──────
interface SpeechRecognitionEventLike extends Event { results: SpeechRecognitionResultList; }
export interface SpeechRecognitionLike {
  lang: string; interimResults: boolean; maxAlternatives: number; continuous: boolean;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: Event) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void; abort?(): void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

export function getSpeechRecognition(): SpeechRecognitionCtor | undefined {
  if (typeof window === 'undefined') return undefined;
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition;
}

export function isIOSDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

// ── 트랜스크립트 병합 ────────────────────────────────────────────
// 안드로이드 Chrome은 ["1시에", "1시에 모유", "1시에 모유 먹었어"]처럼
// 누적된 결과를 매번 다시 보낸다. 단순 이어붙이면 "1시에 1시에 모유모유"가 된다.
export function mergeTranscript(base: string, seg: string): string {
  const b = base.trim(), s = seg.trim();
  if (!s) return b;
  if (!b) return s;
  if (b === s || b.endsWith(s)) return b;   // 같은 구간 재전달 → 무시
  if (s.startsWith(b)) return s;            // 누적형 결과 → 통째로 대체
  // b의 꼬리와 s의 머리가 겹치면 겹친 만큼 잘라낸다
  for (let n = Math.min(b.length, s.length); n > 0; n--) {
    if (b.slice(-n) === s.slice(0, n)) return b + s.slice(n);
  }
  return b + ' ' + s;
}

// ── 호출어 매칭 ──────────────────────────────────────────────────
// "데이비". 한국어 STT는 이걸 "대이비", "데이브", "테이비"로도 흘리므로
// 변형 목록과 대조한다. 공백도 제멋대로 들어가서("데 이비") 지우고 비교한다.
// 긴 변형을 먼저 맞춰야 "데이비야"에서 조사 "야"가 명령에 섞이지 않는다.
export const WAKE_WORDS = ['데이비야', '데이비아', '데이비', '대이비', '테이비', '데이브', '데이비스'];

const stripPunct = (s: string) => s.replace(/[.,!?~…·"'"'\s]/g, '');

/**
 * 호출어가 들어있으면 hit=true와 호출어 뒤에 남은 말(rest)을 돌려준다.
 * "데이비 지금 분유 먹였어" → { hit:true, rest:"지금 분유 먹였어" }
 * 한 호흡에 말한 명령을 그대로 살려야 두 번 말하는 수고가 없어진다.
 *
 * 공백을 지우고 비교하므로 단어 경계를 반드시 따로 확인해야 한다.
 * 안 그러면 "그런데 이비인후과 갔어" → "그런데이비인후과..."가 걸려버린다.
 * (육아 앱에서 이비인후과는 실제로 자주 나오는 말이다)
 */
export function matchWake(text: string): { hit: boolean; rest: string } {
  const flat = stripPunct(text);
  // 공백 제거 인덱스 → 원문 인덱스 대응표
  const map: number[] = [];
  for (let i = 0; i < text.length; i++) if (stripPunct(text[i])) map.push(i);

  let best = -1, bestWord = '';
  for (const w of WAKE_WORDS) {
    let from = 0;
    for (;;) {
      const i = flat.indexOf(w, from);
      if (i === -1) break;
      // 원문에서 이 자리가 어절 시작인지 본다 (문장 맨 앞이거나 앞이 공백/문장부호)
      const orig = map[i];
      const atBoundary = orig === 0 || !stripPunct(text[orig - 1]);
      if (atBoundary && (best === -1 || i < best || (i === best && w.length > bestWord.length))) {
        best = i; bestWord = w;
      }
      from = i + 1;
    }
  }
  if (best === -1) return { hit: false, rest: '' };

  const endFlat = best + bestWord.length;
  const cut = endFlat >= map.length ? text.length : map[endFlat];
  // 호출어 뒤에 남은 조사·문장부호("데이비야, 오늘…")는 명령에서 걷어낸다
  return { hit: true, rest: text.slice(cut).replace(/^[.,!?~…·"'"'\s]+/, '').trim() };
}

// ── HTML 답변 → 낭독용 평문 ──────────────────────────────────────
const SPEAK_LIMIT = 300;

/**
 * 챗봇 답변은 HTML이고 뒤에 RAG 출처 카드(`.rag-sources`, renderSources 생성)가 붙는다.
 * 출처는 낭독에서 빼고, 목록은 문장으로 끊고, 너무 길면 잘라낸다.
 */
export function htmlToSpeech(html: string): string {
  // 목록·줄바꿈을 먼저 문장 구분으로 바꾼다 (textContent는 구조를 다 잃어버린다)
  const pre = html
    .replace(/<\/li>/gi, '. ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|ul|ol)>/gi, '\n');

  let t: string;
  if (typeof DOMParser !== 'undefined') {
    // DOMParser는 스크립트를 실행하지 않고 이미지도 받지 않는다. 엔티티는 알아서 풀린다.
    const doc = new DOMParser().parseFromString(pre, 'text/html');
    doc.querySelectorAll('.rag-sources').forEach(el => el.remove());
    t = doc.body.textContent || '';
  } else {
    t = pre.replace(/<div class="rag-sources"[\s\S]*$/i, '').replace(/<[^>]+>/g, '');
  }

  t = t.replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').replace(/\n{2,}/g, '\n').trim();
  if (t.length > SPEAK_LIMIT) t = t.slice(0, SPEAK_LIMIT).trim() + '. 자세한 내용은 화면을 봐주세요.';
  return t;
}

/** 토스트 문구를 낭독용으로. 이모지와 장식을 걷어낸다. */
export function toastToSpeech(msg: string): string {
  return msg
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── 상태머신 ─────────────────────────────────────────────────────
export type VoiceMode = 'off' | 'wake' | 'command' | 'processing' | 'speaking' | 'followup';

const SILENCE_MS = 1500;        // 발화 종료 판정
const FOLLOWUP_MS = 6000;       // 답변 후 호출어 없이 받는 시간
const IDLE_OFF_MS = 30 * 60_000; // 무발화 자동 종료
const MAX_NET_RETRY = 5;

interface Options {
  /** 명령 문장이 확정되면 호출된다 (→ processVoiceInput) */
  onCommand: (text: string) => void;
  /** 핸즈프리 사용 여부 */
  enabled: boolean;
  /** FAB 등 외부 인식기가 마이크를 쓰는 중이면 true — 핸즈프리를 잠시 비운다 */
  externalBusy?: boolean;
  onNotice?: (msg: string) => void;
}

export function useVoiceAgent({ onCommand, enabled, externalBusy, onNotice }: Options) {
  const [mode, setMode] = useState<VoiceMode>('off');
  const [transcript, setTranscript] = useState('');
  const [supported, setSupported] = useState(true);

  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const modeRef = useRef<VoiceMode>('off');
  const netRetryRef = useRef(0);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const followupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCommandRef = useRef(onCommand);
  const onNoticeRef = useRef(onNotice);
  useEffect(() => { onCommandRef.current = onCommand; onNoticeRef.current = onNotice; });
  // startSession은 자기 자신을 재귀 호출한다(세션 재시작). useCallback 안에서
  // 직접 참조하면 선언 전 접근이 되므로 ref를 한 겹 둔다.
  const startRef = useRef<(t: 'wake' | 'command' | 'followup') => void>(() => {});

  const setModeBoth = useCallback((m: VoiceMode) => { modeRef.current = m; setMode(m); }, []);

  // 살아있는 인식기를 완전히 끊는다. 핸들러를 먼저 떼야 abort가 onend를 되쏘지 않는다.
  const killRecognizer = useCallback(() => {
    const stale = recRef.current;
    recRef.current = null;
    if (!stale) return;
    stale.onresult = null; stale.onend = null; stale.onerror = null;
    try {
      if (stale.abort) stale.abort();
      else stale.stop();
    } catch { /* already dead */ }
  }, []);

  // 호출어를 들었다는 신호음. 화면을 안 보는 사용자에겐 이게 유일한 피드백이다.
  const beep = useCallback(() => {
    try {
      const Ctx = (window as Window & { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
        || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.frequency.value = 880; osc.type = 'sine';
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(); osc.stop(ctx.currentTime + 0.18);
      osc.onended = () => { try { ctx.close(); } catch {} };
    } catch { /* 오디오 불가 — 무시 */ }
  }, []);

  const armIdleOff = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      killRecognizer();
      setModeBoth('off');
      onNoticeRef.current?.('🎤 30분간 사용이 없어 핸즈프리를 껐어요');
    }, IDLE_OFF_MS);
  }, [killRecognizer, setModeBoth]);

  // ── 세션 시작 ──────────────────────────────────────────────────
  // wake: 호출어만 찾는다 / command·followup: 명령 문장을 캡처한다
  const startSession = useCallback((target: 'wake' | 'command' | 'followup') => {
    const SR = getSpeechRecognition();
    if (!SR) { setSupported(false); setModeBoth('off'); return; }
    killRecognizer();

    const isIOS = isIOSDevice();
    const rec = new SR();
    rec.lang = 'ko-KR';
    // iOS Safari는 interim/continuous가 불안정하다. 꺼두면 호출어 모드가
    // 사실상 "한 마디 듣고 끝"이 되므로, onend 재시작 루프로 메운다.
    rec.interimResults = !isIOS;
    rec.continuous = !isIOS;
    rec.maxAlternatives = 1;

    let finalText = '', interimText = '', finalizedUpTo = 0, done = false;
    let silence: ReturnType<typeof setTimeout> | null = null;
    const current = () => mergeTranscript(finalText, interimText);

    const finish = () => {
      if (done) return;
      done = true;
      if (silence) { clearTimeout(silence); silence = null; }
      try { rec.stop(); } catch {}
      const text = current().trim();
      if (!text) { if (modeRef.current !== 'off') startRef.current('wake'); return; }
      setTranscript('');
      setModeBoth('processing');
      armIdleOff();
      onCommandRef.current(text);
    };

    rec.onresult = (e) => {
      if (done) return;
      interimText = '';
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) {
          if (i >= finalizedUpTo) { finalText = mergeTranscript(finalText, r[0].transcript); finalizedUpTo = i + 1; }
        } else {
          interimText = mergeTranscript(interimText, r[0].transcript);
        }
      }
      const text = current();

      if (target === 'wake') {
        const { hit, rest } = matchWake(text);
        if (!hit) { setTranscript(''); return; }
        done = true;
        if (silence) { clearTimeout(silence); silence = null; }
        try { rec.stop(); } catch {}
        beep();
        armIdleOff();
        if (rest) {
          // 한 호흡 발화 — 뒤에 붙은 명령을 그대로 처리한다
          setTranscript('');
          setModeBoth('processing');
          onCommandRef.current(rest);
        } else {
          setTranscript('');
          setModeBoth('command');
          setTimeout(() => startRef.current('command'), 120);
        }
        return;
      }

      // 명령 캡처 — 침묵 1.5초로 종료 판정 (isFinal에 의존하면 안드로이드에서 잘린다)
      setTranscript(text);
      if (silence) clearTimeout(silence);
      silence = setTimeout(finish, SILENCE_MS);
    };

    rec.onerror = (e) => {
      const err = (e as Event & { error?: string }).error;
      if (err === 'aborted') return;
      if (err === 'not-allowed') {
        killRecognizer(); setModeBoth('off');
        onNoticeRef.current?.('🎤 마이크 권한을 허용해주세요');
        return;
      }
      if (err === 'network') {
        // 지수 백오프. 안 걸면 오프라인에서 초당 수십 번 재시도한다.
        netRetryRef.current += 1;
        if (netRetryRef.current > MAX_NET_RETRY) {
          killRecognizer(); setModeBoth('off');
          onNoticeRef.current?.('🎤 네트워크가 불안정해 핸즈프리를 껐어요');
          return;
        }
        const wait = Math.min(8000, 1000 * 2 ** (netRetryRef.current - 1));
        setTimeout(() => { if (modeRef.current !== 'off') startRef.current(target); }, wait);
        return;
      }
      if (err === 'no-speech') { if (!done && current()) finish(); return; }
    };

    rec.onend = () => {
      if (done) return;
      if (target !== 'wake' && current()) { finish(); return; }
      // Chrome은 수십 초마다 세션을 스스로 끊는다. 대기 모드면 다시 띄운다.
      if (modeRef.current === 'wake' || modeRef.current === 'followup') {
        setTimeout(() => { if (modeRef.current !== 'off') startRef.current('wake'); }, 300);
      }
    };

    recRef.current = rec;
    try { rec.start(); netRetryRef.current = 0; }
    catch { /* 이미 시작됨 — 무시 */ }
  }, [killRecognizer, setModeBoth, beep, armIdleOff]);
  useEffect(() => { startRef.current = startSession; }, [startSession]);

  // ── TTS ────────────────────────────────────────────────────────
  // 읽는 동안 인식기를 완전히 끈다. 안 끄면 자기 목소리를 명령으로 받아 무한 루프에 빠진다.
  const speak = useCallback((text: string, opts?: { thenListen?: boolean }) => {
    const plain = text.trim();
    const thenListen = opts?.thenListen ?? true;
    const resume = () => {
      if (!enabled || modeRef.current === 'off') return;
      if (thenListen) {
        setModeBoth('followup');
        startSession('followup');
        if (followupTimerRef.current) clearTimeout(followupTimerRef.current);
        followupTimerRef.current = setTimeout(() => {
          if (modeRef.current === 'followup') { setModeBoth('wake'); startSession('wake'); }
        }, FOLLOWUP_MS);
      } else {
        setModeBoth('wake');
        startSession('wake');
      }
    };

    if (!plain || typeof window === 'undefined' || !window.speechSynthesis) { resume(); return; }
    killRecognizer();
    setModeBoth('speaking');
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(plain);
      u.lang = 'ko-KR';
      const ko = window.speechSynthesis.getVoices().find(v => v.lang?.toLowerCase().startsWith('ko'));
      if (ko) u.voice = ko;
      u.rate = 1.05;
      // onerror도 반드시 잡아야 한다. 안 잡으면 speaking 상태에 영구히 갇힌다.
      u.onend = resume;
      u.onerror = resume;
      window.speechSynthesis.speak(u);
    } catch { resume(); }
  }, [enabled, killRecognizer, setModeBoth, startSession]);

  /** 명령 처리가 끝났음을 알린다. 낭독할 게 없으면 바로 대기로 돌아간다. */
  const finishCommand = useCallback(() => {
    if (!enabled || modeRef.current === 'off') return;
    setModeBoth('wake');
    startSession('wake');
  }, [enabled, setModeBoth, startSession]);

  // ── 켜기/끄기 ──────────────────────────────────────────────────
  // 인식기를 끊은 직후 곧바로 새로 띄우면 엔진이 아직 정리되지 않아 start()가
  // 조용히 실패한다. 한 틱 미뤄서 시작한다.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const cleanup = () => {
      if (timer) clearTimeout(timer);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };

    if (!enabled) {
      killRecognizer();
      if (typeof window !== 'undefined') window.speechSynthesis?.cancel();
      if (followupTimerRef.current) clearTimeout(followupTimerRef.current);
      timer = setTimeout(() => { setModeBoth('off'); setTranscript(''); }, 0);
      return cleanup;
    }
    if (!getSpeechRecognition()) { timer = setTimeout(() => setSupported(false), 0); return cleanup; }
    // FAB이 마이크를 쓰는 중엔 비켜준다 (인식기 2개가 동시에 돌면 둘 다 망가진다)
    if (externalBusy) { killRecognizer(); timer = setTimeout(() => setModeBoth('off'), 0); return cleanup; }
    timer = setTimeout(() => {
      if (modeRef.current === 'off') { setModeBoth('wake'); startSession('wake'); armIdleOff(); }
    }, 0);
    return cleanup;
  }, [enabled, externalBusy, killRecognizer, setModeBoth, startSession, armIdleOff]);

  // 화면이 가려지면 대기를 멈춘다. 배터리와 프라이버시 양쪽 문제.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onVis = () => {
      if (!enabled) return;
      if (document.hidden) {
        killRecognizer();
        window.speechSynthesis?.cancel();
        setModeBoth('off');
      } else if (modeRef.current === 'off' && !externalBusy) {
        setModeBoth('wake'); startSession('wake'); armIdleOff();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [enabled, externalBusy, killRecognizer, setModeBoth, startSession, armIdleOff]);

  // 언마운트 정리
  useEffect(() => () => {
    killRecognizer();
    if (typeof window !== 'undefined') window.speechSynthesis?.cancel();
  }, [killRecognizer]);

  return { mode, transcript, supported, speak, finishCommand };
}
