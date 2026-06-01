'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

// ── Types ────────────────────────────────────────────────────────

// Web Speech API — not yet included in TypeScript 5.9 DOM lib
interface SpeechRecognitionEvent extends Event { results: SpeechRecognitionResultList; }
interface SpeechRecognitionLike {
  lang: string; interimResults: boolean; maxAlternatives: number;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: Event) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

type LogType = 'sleep' | 'feed' | 'pee' | 'poop' | 'cry' | 'walk' | 'play' | 'bath' | 'measure' | 'other';
type Page = 'home' | 'timeline' | 'schedule' | 'health' | 'chat' | 'info';
type ModalState = 'setup' | 'addLog' | 'healthLog' | 'logDetail' | 'settings' | null;
type TodoCat = 'vaccine' | 'feeding' | 'play' | 'supplies' | 'other';
type TodoFilter = 'all' | TodoCat;
type HealthTab = 'development' | 'logs' | 'medication' | 'report';
type HealthLogType = 'temp' | 'rash' | 'symptom' | 'other';
type HealthModalMode = 'health' | 'medication';
type ReportMode = 'week' | 'month';
type GrowthMetric = 'height' | 'weight';

interface Baby { name: string; birthDate: string; gender: 'boy' | 'girl'; }
interface Log {
  id: string; type: LogType; date: string; note: string;
  startTime?: string; endTime?: string; time?: string;
  amount?: number | null; feedType?: string; color?: string; reason?: string;
}
interface Todo { id: string; text: string; category: TodoCat; completed: boolean; createdAt: number; date?: string; }
interface HealthLog { id: string; type: HealthLogType; detail: string; date: string; time: string; }
interface Medication { id: string; name: string; dose: string; freq: string; note: string; date: string; }
interface Growth { id: string; date: string; height?: number; weight?: number; }
interface AppState {
  babyId: number | null;
  baby: Baby | null;
  logs: Record<string, Log[]>;
  todos: Todo[];
  health: { logs: HealthLog[]; medications: Medication[]; };
  development: Record<string, boolean>;
  growth: Growth[];
}
interface ChatMsg { id: string; role: 'user' | 'bot'; html: string; isTyping?: boolean; }
interface MilestoneItem { id: string; text: string; }
interface MilestoneGroup { minM: number; maxM: number; title: string; icon: string; items: MilestoneItem[]; }
interface RagChunkMeta { source: string; page?: number; }
interface RagChunk { text: string; metadata: RagChunkMeta; }
interface RagFigure { title: string; image?: string; metadata: { source: string; page?: number; }; }
interface YtVideo { id:string; title:string; thumbnail:string; channelTitle:string; publishedAt:string; viewCount:string; duration:string; }
interface YtCat { id:string; label:string; desc:string; emoji:string; tone:string; text:string; queries:string[]; sortOrder:string; }

// ── Constants ────────────────────────────────────────────────────
const TYPE_LABELS: Record<LogType, string> = { sleep:'수면', feed:'수유', pee:'소변', poop:'대변', cry:'울음', walk:'산책', play:'놀이', bath:'목욕', measure:'측정', other:'기타' };
const TYPE_ICONS:  Record<LogType, string> = { sleep:'😴', feed:'🍼', pee:'💧', poop:'💩', cry:'😢', walk:'🌿', play:'🧸', bath:'🛁', measure:'📏', other:'📝' };
const CAT_LABELS:  Record<TodoCat, string> = { vaccine:'예방접종', feeding:'수유', play:'놀이', supplies:'생필품', other:'기타' };

// ── Voice Tools (LLM intent router) ─────────────────────────────
const VOICE_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'record_activity',
      description: '아기의 활동(수유, 수면, 기저귀, 산책, 울음, 놀이, 목욕)을 시간표에 기록합니다. 여러 시간이 언급되면 times 배열에 모두 담아주세요.',
      parameters: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['feed','sleep','pee','poop','cry','walk','play','bath'], description: 'feed=수유(젖/분유/이유식 포함), sleep=수면, pee=소변(쉬/오줌), poop=대변(똥), cry=울음, walk=산책, play=놀이, bath=목욕' },
          times:    { type: 'array', items: { type: 'string' }, description: '기록할 시간 HH:MM 배열. 여러 시간이 언급되면 모두 포함. "2시"→"02:00", "오후 3시"→"15:00"' },
          time:     { type: 'string', description: '단일 시간 HH:MM. times가 없을 때만 사용' },
          endTime:  { type: 'string', description: '종료 시간 HH:MM. sleep/cry/walk/play/bath에 해당' },
          amount:   { type: 'number', description: '수유량(ml). 수유일 때만' },
          feedType: { type: 'string', enum: ['모유','분유','유축모유','혼합','이유식','우유'], description: '수유 종류. 젖/모유수유→모유, 분유→분유, 유축→유축모유, 이유식→이유식' },
          note:     { type: 'string', description: '메모나 특이사항' },
        },
        required: ['type'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'save_schedule',
      description: '할일이나 예약 일정(예방접종, 병원, 이유식 재료, 쇼핑 등)을 스케줄에 저장합니다.',
      parameters: {
        type: 'object',
        properties: {
          text:     { type: 'string', description: '할일 내용 (간결하게, 날짜 표현 제외)' },
          category: { type: 'string', enum: ['vaccine','feeding','play','supplies','other'], description: 'vaccine=예방접종·백신(명확히 접종인 경우만), feeding=분유·이유식·수유 관련, play=장난감·놀이·발달 용품, supplies=기저귀·물티슈·생필품 구매, other=병원·기타(애매하면 other)' },
          date:     { type: 'string', description: 'YYYY-MM-DD 형식. "다음주"→제공된 nextMonday, "다음달"→제공된 nextMonth1st, "내일"→오늘+1일, "모레"→오늘+2일, "6월5일"→해당 날짜. 특정 날짜 없으면 오늘 날짜.' },
        },
        required: ['text', 'category'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'record_measurement',
      description: '아기 키(cm), 몸무게(kg), 체온(°C)을 측정해 기록합니다.',
      parameters: {
        type: 'object',
        properties: {
          metric: { type: 'string', enum: ['height','weight','temp'], description: 'height=키, weight=몸무게, temp=체온' },
          value:  { type: 'number', description: '측정값. 키=cm, 몸무게=kg, 체온=°C' },
          time:   { type: 'string', description: '측정 시각 HH:MM' },
        },
        required: ['metric','value'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'track_sleep',
      description: '"자고 있어/잠들었어" → action=start, "깼어/일어났어/기상" → action=end. 수면 시작/종료를 추적합니다.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['start', 'end'], description: 'start=수면 시작, end=기상' },
          time:   { type: 'string', description: '시각 HH:MM. 없으면 생략' },
        },
        required: ['action'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'track_feed',
      description: '수유 진행 중 추적. "지금 분유/모유 주고 있어/시작해" → action=start, "다 먹었어/X ml 남겼어/X 남겼어" → action=end.',
      parameters: {
        type: 'object',
        properties: {
          action:   { type: 'string', enum: ['start', 'end'], description: 'start=수유 시작, end=수유 완료' },
          feedType: { type: 'string', enum: ['모유','분유','유축모유','혼합','이유식','우유'], description: '수유 종류' },
          amount:   { type: 'number', description: 'start: 줄 예정 수유량(ml) / end: 남긴 양(ml). 다 먹었으면 0' },
          time:     { type: 'string', description: '시각 HH:MM' },
        },
        required: ['action'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'chat_response',
      description: '아기 육아 정보 질문, 조언 요청, 일반 대화에 답변합니다.',
      parameters: {
        type: 'object',
        properties: {
          message: { type: 'string', description: '사용자의 원본 메시지' },
        },
        required: ['message'],
      },
    },
  },
];

// ── YouTube Categories & Stage Map ───────────────────────────────
const YT_CATS: YtCat[] = [
  { id:'age',   label:'우리아이는 지금', desc:'발달단계에 따른 특징',       emoji:'👶', tone:'#FFE4CF', text:'#B85617',
    queries:['아기 개월수별 발달 특징','신생아 황달 증상 대처','배앓이 달래기 방법','이앓이 시기 증상','뒤집기 시작 시기','아기 성장 마일스톤'], sortOrder:'relevance' },
  { id:'feed',  label:'먹기',           desc:'수유 · 이유식 · 분유량',     emoji:'🍼', tone:'#FFF1C9', text:'#8B6F00',
    queries:['초기 이유식 만들기','이유식 시작 시기','모유수유 자세 방법','월령별 분유량','이유식 거부 대처법','중기 후기 이유식 레시피'], sortOrder:'viewCount' },
  { id:'play',  label:'놀기',           desc:'발달 놀이 · 장난감',         emoji:'🧸', tone:'#E2F1C4', text:'#5C8629',
    queries:['개월수별 발달 놀이','아기 오감 놀이','터미타임 방법','개월별 장난감 추천','DIY 아기 놀잇감','인지 발달 놀이'], sortOrder:'relevance' },
  { id:'sleep', label:'자기',           desc:'수면교육 · 통잠',             emoji:'😴', tone:'#DCE7F8', text:'#3A5E9C',
    queries:['아기 수면교육 방법','퍼버법 수면훈련','통잠 만들기','낮잠 스케줄','잠투정 달래기','야간 수유 끊기'], sortOrder:'relevance' },
  { id:'health',label:'건강',           desc:'예방접종 · 감염병 · 응급처치', emoji:'🩺', tone:'#FFD8DE', text:'#A33B53',
    queries:['영유아 예방접종 종류','아기 발열 대처법','영유아 검진 준비','수족구 RSV 대처','아기 응급처치','소아과 방문 기준'], sortOrder:'relevance' },
  { id:'etc',   label:'기타',           desc:'육아 정책 · 지원금 · 보험',   emoji:'📋', tone:'#EADBFA', text:'#6A4DAA',
    queries:['2026 첫만남이용권','부모급여 신청 방법','육아휴직 급여','아기보험 추천','산후도우미 지원','보육료 지원 신청'], sortOrder:'date' },
];

const YT_STAGE_MAP: Record<string, {label:string; primary:string[]}> = {
  newborn: { label:'신생아',     primary:['age','feed','sleep'] },
  '1-3m':  { label:'1~3개월',   primary:['feed','sleep','age'] },
  '4-6m':  { label:'4~6개월',   primary:['feed','play','sleep'] },
  '7-9m':  { label:'7~9개월',   primary:['feed','play','health'] },
  '10-12m':{ label:'10~12개월', primary:['play','feed','health'] },
  toddler: { label:'12개월+',   primary:['play','feed','health'] },
};

function ytAgeStage(months: number): string {
  if (months < 1)  return 'newborn';
  if (months <= 3)  return '1-3m';
  if (months <= 6)  return '4-6m';
  if (months <= 9)  return '7-9m';
  if (months <= 12) return '10-12m';
  return 'toddler';
}
function ytFmtViews(n: string) {
  const v = parseInt(n, 10);
  if (isNaN(v) || v === 0) return '';
  if (v >= 100_000_000) return `${(v/100_000_000).toFixed(1)}억회`;
  if (v >= 10_000) return `${(v/10_000).toFixed(1)}만회`;
  return `${v.toLocaleString()}회`;
}
function ytFmtDate(iso: string) {
  if (!iso) return '';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days < 1) return '오늘';
  if (days < 7) return `${days}일 전`;
  if (days < 30) return `${Math.floor(days/7)}주 전`;
  if (days < 365) return `${Math.floor(days/30)}개월 전`;
  return new Date(iso).toLocaleDateString('ko');
}
const YT_CACHE_TTL = 24 * 60 * 60 * 1000;
const YT_CACHE_VERSION = 'v3';
function ytGetCache(key: string) {
  try {
    const raw = localStorage.getItem(`yt_${YT_CACHE_VERSION}_${key}`);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > YT_CACHE_TTL) return null;
    return data;
  } catch { return null; }
}
function ytSetCache(key: string, data: unknown) {
  try { localStorage.setItem(`yt_${YT_CACHE_VERSION}_${key}`, JSON.stringify({ ts: Date.now(), data })); }
  catch { /* quota */ }
}

// ── Utilities ────────────────────────────────────────────────────
function localDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function todayStr() { return localDateStr(new Date()); }
function parseDate(s: string) { const [y,m,d]=s.split('-').map(Number); return new Date(y,m-1,d); }
function shiftDate(s: string, delta: number) { const d=parseDate(s); d.setDate(d.getDate()+delta); return localDateStr(d); }
function fmtDisplayDate(s: string) {
  const d=parseDate(s), days=['일','월','화','수','목','금','토'], t=todayStr();
  const label = s===t?' (오늘)':s===shiftDate(t,-1)?' (어제)':'';
  return `${d.getMonth()+1}월 ${d.getDate()}일 (${days[d.getDay()]})${label}`;
}
function nowHHMM() { const d=new Date(); return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; }
function hmToMin(hhmm: string) { const [h,m]=hhmm.split(':').map(Number); return h*60+m; }
function minToHM(min: number) { return `${String(Math.floor(min/60)).padStart(2,'0')}:${String(min%60).padStart(2,'0')}`; }
function fmtDuration(s: string, e: string) {
  let d=hmToMin(e)-hmToMin(s); if(d<=0) d+=1440;
  const h=Math.floor(d/60),m=d%60; return h>0?`${h}시간 ${m}분`:`${m}분`;
}
function uid() { return Date.now().toString(36)+Math.random().toString(36).slice(2,7); }

// 자연어 날짜 표현을 YYYY-MM-DD로 변환. 매칭 없으면 null 반환
function parseNaturalDate(text: string): string | null {
  const t = text.replace(/\s/g, '');
  const today = new Date();

  if (/다음달/.test(t)) {
    return localDateStr(new Date(today.getFullYear(), today.getMonth() + 1, 1));
  }
  // 다음주 X요일 (예: 다음주화요일)
  const nextWeekDow = t.match(/다음주([월화수목금토일])요?일?/);
  if (nextWeekDow) {
    const dayMap: Record<string, number> = { 월:1, 화:2, 수:3, 목:4, 금:5, 토:6, 일:0 };
    const target = dayMap[nextWeekDow[1]];
    const dow = today.getDay();
    const daysFromMonday = dow === 0 ? 6 : dow - 1;
    const thisMonday = new Date(today); thisMonday.setDate(today.getDate() - daysFromMonday);
    const nextMonday = new Date(thisMonday); nextMonday.setDate(thisMonday.getDate() + 7);
    const diff = target === 0 ? 6 : target - 1; // 월요일 기준 offset
    nextMonday.setDate(nextMonday.getDate() + diff);
    return localDateStr(nextMonday);
  }
  if (/다음주/.test(t)) {
    const dow = today.getDay();
    const daysFromMonday = dow === 0 ? 6 : dow - 1;
    const d = new Date(today); d.setDate(today.getDate() - daysFromMonday + 7);
    return localDateStr(d);
  }
  // 이번주 X요일
  const thisWeekDow = t.match(/이번주([월화수목금토일])요?일?/);
  if (thisWeekDow) {
    const dayMap: Record<string, number> = { 월:1, 화:2, 수:3, 목:4, 금:5, 토:6, 일:0 };
    const target = dayMap[thisWeekDow[1]];
    const dow = today.getDay();
    const daysFromMonday = dow === 0 ? 6 : dow - 1;
    const thisMonday = new Date(today); thisMonday.setDate(today.getDate() - daysFromMonday);
    const diff = target === 0 ? 6 : target - 1;
    thisMonday.setDate(thisMonday.getDate() + diff);
    return localDateStr(thisMonday);
  }
  if (/모레/.test(t)) {
    const d = new Date(today); d.setDate(today.getDate() + 2);
    return localDateStr(d);
  }
  if (/내일/.test(t)) {
    const d = new Date(today); d.setDate(today.getDate() + 1);
    return localDateStr(d);
  }
  // "6월 5일", "6/5" 형태
  const mdMatch = t.match(/(\d{1,2})월(\d{1,2})일?/) || t.match(/(\d{1,2})\/(\d{1,2})/);
  if (mdMatch) {
    const month = parseInt(mdMatch[1], 10) - 1;
    const day   = parseInt(mdMatch[2], 10);
    const year  = today.getMonth() > month || (today.getMonth() === month && today.getDate() > day)
      ? today.getFullYear() + 1
      : today.getFullYear();
    return localDateStr(new Date(year, month, day));
  }
  return null;
}
// LLM에 전달할 날짜 컨텍스트 계산 (save_schedule date 파라미터용)
function buildDateContext(): { todayDate: string; nextMonday: string; nextMonth1st: string; todayDow: string } {
  const today = new Date();
  const dow = today.getDay();
  const dowLabel = ['일','월','화','수','목','금','토'][dow];
  const daysFromMonday = dow === 0 ? 6 : dow - 1;
  const nm = new Date(today); nm.setDate(today.getDate() - daysFromMonday + 7);
  const nm1 = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  return {
    todayDate:   localDateStr(today),
    todayDow:    dowLabel,
    nextMonday:  localDateStr(nm),
    nextMonth1st: localDateStr(nm1),
  };
}
function getAgeInfo(birthStr: string) {
  const birth=parseDate(birthStr), now=new Date();
  const diffDays=Math.floor((now.getTime()-birth.getTime())/86400000);
  const weeks=Math.floor(diffDays/7), remDays=diffDays%7;
  let months=(now.getFullYear()-birth.getFullYear())*12+(now.getMonth()-birth.getMonth());
  if(now.getDate()<birth.getDate()) months--;
  if(months<0) months=0;
  const lmd=new Date(birth.getFullYear(),birth.getMonth()+months,birth.getDate());
  const monthRemDays=Math.floor((now.getTime()-lmd.getTime())/86400000);
  return { diffDays, weeks, remDays, months, monthRemDays };
}
function koreanParticle(name: string, wc: string, wv: string) {
  if(!name) return wv;
  const code=name.charCodeAt(name.length-1);
  if(code>=0xAC00&&code<=0xD7A3) return (code-0xAC00)%28!==0?wc:wv;
  return wv;
}
function escHtml(s: string) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function defaultState(): AppState {
  return { babyId:null, baby:null, logs:{}, todos:[], health:{logs:[],medications:[]}, development:{}, growth:[] };
}

// ── WHO Growth Standards P3/P50/P97 (0-24 months) ────────────
const GROWTH_DATA = {
  boy:  { height:{P3:[46.1,50.2,53.2,55.3,57.0,58.4,59.7,60.9,62.1,63.3,64.5,65.6,66.7,67.7,68.7,69.7,70.6,71.5,72.4,73.3,74.2,75.1,75.9,76.8,77.7],P50:[49.9,54.7,58.4,61.4,63.9,65.9,67.6,69.2,70.6,72.0,73.3,74.5,75.7,76.9,78.0,79.1,80.2,81.2,82.3,83.2,84.2,85.1,86.0,86.9,87.8],P97:[53.4,59.0,63.2,66.8,69.4,71.9,74.0,75.9,77.7,79.3,80.9,82.4,83.8,85.1,86.4,87.7,88.9,90.1,91.3,92.5,93.7,94.9,96.0,97.2,98.3]}, weight:{P3:[2.5,3.4,4.4,5.1,5.6,6.1,6.4,6.7,7.0,7.2,7.4,7.6,7.8,8.0,8.2,8.4,8.6,8.7,8.9,9.1,9.2,9.4,9.5,9.7,9.8],P50:[3.3,4.5,5.6,6.4,7.0,7.5,7.9,8.3,8.6,8.9,9.2,9.4,9.6,9.9,10.1,10.3,10.5,10.7,10.9,11.1,11.3,11.5,11.8,12.0,12.2],P97:[4.4,5.8,7.1,8.0,8.7,9.3,9.8,10.3,10.7,11.0,11.4,11.7,12.0,12.3,12.6,12.9,13.2,13.5,13.8,14.1,14.4,14.7,15.0,15.3,15.6]} },
  girl: { height:{P3:[45.6,49.2,52.1,54.2,55.9,57.4,58.7,59.9,61.0,62.2,63.3,64.4,65.4,66.4,67.4,68.3,69.3,70.2,71.1,72.0,72.8,73.7,74.5,75.4,76.2],P50:[49.1,53.7,57.1,59.8,62.1,64.0,65.7,67.3,68.7,70.1,71.5,72.8,74.0,75.2,76.4,77.5,78.6,79.7,80.7,81.7,82.7,83.7,84.6,85.5,86.4],P97:[52.9,58.1,62.1,65.2,67.8,70.0,71.9,73.7,75.3,76.9,78.4,79.9,81.3,82.7,84.0,85.3,86.6,87.9,89.1,90.3,91.5,92.6,93.7,94.8,95.9]}, weight:{P3:[2.4,3.2,4.0,4.7,5.1,5.5,5.8,6.1,6.3,6.5,6.7,6.9,7.1,7.2,7.4,7.6,7.8,7.9,8.1,8.2,8.4,8.6,8.7,8.9,9.0],P50:[3.2,4.2,5.1,5.8,6.4,6.9,7.3,7.6,7.9,8.2,8.5,8.7,9.0,9.2,9.4,9.6,9.8,10.0,10.2,10.4,10.6,10.9,11.1,11.3,11.5],P97:[4.2,5.5,6.6,7.5,8.2,8.8,9.3,9.8,10.2,10.5,10.9,11.2,11.5,11.8,12.1,12.4,12.7,13.0,13.2,13.5,13.8,14.0,14.3,14.6,14.8]} },
};

function calcPercentile(value: number, ageMonths: number, metric: GrowthMetric, gender: 'boy'|'girl') {
  const d = GROWTH_DATA[gender][metric];
  const m = Math.max(0, Math.min(24, Math.round(ageMonths)));
  const p3=d.P3[m], p50=d.P50[m], p97=d.P97[m];
  let pct: number;
  if(value<=p3) pct=3;
  else if(value>=p97) pct=97;
  else if(value<=p50) pct=Math.round(3+(value-p3)/(p50-p3)*47);
  else pct=Math.round(50+(value-p50)/(p97-p50)*47);
  const emoji = pct<=15?'⬇️':pct>=85?'⬆️':'✅';
  const label = pct<=15?`하위 ${pct}%`:pct>=85?`상위 ${100-pct}%`:`중간 범위 (${pct}번째 백분위)`;
  return { pct, emoji, label };
}

function buildGrowthSVG(records: Growth[], metric: GrowthMetric, gender: 'boy'|'girl', birthDate?: string): string {
  const gd = GROWTH_DATA[gender][metric];
  const months = Array.from({length:25},(_,i)=>i);
  const L=38,T=14,R=12,B=22,W=300,H=180;
  const cW=W-L-R, cH=H-T-B;
  const yRange = metric==='height'?{min:43,max:101}:{min:2,max:16};
  const xS=(m:number)=>L+(m/24)*cW;
  const yS=(v:number)=>T+cH-((v-yRange.min)/(yRange.max-yRange.min))*cH;
  const pl=(arr:number[],color:string,dash:string,sw=1.5)=>{
    const pts=months.map(m=>`${xS(m).toFixed(1)},${yS(arr[m]).toFixed(1)}`).join(' ');
    return `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-dasharray="${dash}" stroke-linecap="round" stroke-linejoin="round"/>`;
  };
  const bandPts=[...months.map(m=>`${xS(m).toFixed(1)},${yS(gd.P97[m]).toFixed(1)}`), ...months.slice().reverse().map(m=>`${xS(m).toFixed(1)},${yS(gd.P3[m]).toFixed(1)}`)].join(' ');
  const xLabels=[0,6,12,18,24].map(m=>`<text x="${xS(m).toFixed(1)}" y="${(T+cH+14).toFixed(1)}" text-anchor="middle" font-size="8" fill="#aaa">${m}m</text>`).join('');
  const yTicks=metric==='height'?[50,60,70,80,90,100]:[4,6,8,10,12,14];
  const yLabels=yTicks.map(v=>`<line x1="${L}" y1="${yS(v).toFixed(1)}" x2="${(L+cW).toFixed(1)}" y2="${yS(v).toFixed(1)}" stroke="#f0f0f0" stroke-width="1"/><text x="${(L-3).toFixed(1)}" y="${(yS(v)+3).toFixed(1)}" text-anchor="end" font-size="7.5" fill="#bbb">${v}</text>`).join('');
  let dotsHTML = '';
  if (birthDate) {
    const birth = new Date(birthDate);
    const pts = records.filter(r => r[metric] != null).sort((a,b) => a.date.localeCompare(b.date));
    dotsHTML = pts.map(r => {
      const rec = new Date(r.date);
      const ageMon = Math.max(0, Math.min(24, (rec.getFullYear()-birth.getFullYear())*12+(rec.getMonth()-birth.getMonth())));
      const val = r[metric] as number;
      const cx = xS(ageMon), cy = yS(val);
      const { pct } = calcPercentile(val, ageMon, metric, gender);
      const pctTxt = pct <= 15 ? `하위${pct}%` : pct >= 85 ? `상위${100-pct}%` : `P${pct}`;
      const lx = cx > L+cW*0.6 ? cx-5 : cx+5;
      const anchor = cx > L+cW*0.6 ? 'end' : 'start';
      return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="3.5" fill="#FF8040" stroke="white" stroke-width="1.5"/>` +
             `<text x="${lx.toFixed(1)}" y="${(cy-5).toFixed(1)}" text-anchor="${anchor}" font-size="7" fill="#FF8040" font-weight="bold">${pctTxt}</text>`;
    }).join('');
  }
  return `<svg viewBox="0 0 300 180" xmlns="http://www.w3.org/2000/svg" style="width:100%;display:block">
    ${yLabels}${xLabels}
    <polygon points="${bandPts}" fill="rgba(255,128,64,.08)"/>
    ${pl(gd.P3,'#FFD0A8','4 3')} ${pl(gd.P50,'#FF8040','',2)} ${pl(gd.P97,'#FFD0A8','4 3')}
    ${dotsHTML}
  </svg>`;
}

function buildDonutSVG(segments: {label:string;value:number;color:string}[]): string {
  const total = segments.reduce((s, d) => s + d.value, 0);
  if (total === 0) return '';
  const r=37, cx=54, cy=54, circ=2*Math.PI*r;
  let cum=0;
  const circles = segments.map(seg => {
    const pct=seg.value/total, dash=pct*circ, gap=circ-dash;
    const rot=(cum/total)*360-90; cum+=seg.value;
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${seg.color}" stroke-width="15" stroke-dasharray="${dash.toFixed(2)} ${gap.toFixed(2)}" transform="rotate(${rot.toFixed(1)} ${cx} ${cy})" stroke-linecap="butt"/>`;
  }).join('');
  const legendRows = segments.map(seg => {
    const pct=Math.round(seg.value/total*100);
    if(pct===0) return '';
    return `<div class="donut-leg"><span class="donut-dot" style="background:${seg.color}"></span>${seg.label}<b>${pct}%</b></div>`;
  }).join('');
  return `<div class="donut-wrap"><svg viewBox="0 0 108 108" style="width:108px;height:108px;flex-shrink:0"><circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#EEEAE6" stroke-width="15"/>${circles}</svg><div class="donut-legend">${legendRows}</div></div>`;
}

function buildHeatmap(logs: Record<string, Log[]>, days: number): string {
  const colorMap: Record<string, string> = { sleep:'#4FAACC', feed:'#FF8040', pee:'#E6BC00', poop:'#B97A40', cry:'#E05577', walk:'#78C96E' };
  const rows: string[] = [];
  for (let i=days-1;i>=0;i--) {
    const d=new Date(); d.setDate(d.getDate()-i);
    const key=localDateStr(d);
    const dayLogs=logs[key]||[];
    const hourMap: Record<number, string> = {};
    dayLogs.filter(l=>l.type==='sleep'&&l.startTime&&l.endTime).forEach(l=>{
      let sh=parseInt(l.startTime!), eh=parseInt(l.endTime!);
      if(isNaN(sh)||isNaN(eh)) return;
      if(sh<=eh){for(let h=sh;h<=eh;h++) hourMap[h]='sleep';}
      else{for(let h=sh;h<24;h++) hourMap[h]='sleep'; for(let h=0;h<=eh;h++) hourMap[h]='sleep';}
    });
    dayLogs.filter(l=>l.type!=='sleep').forEach(l=>{
      const t=(l.startTime||l.time||'').split(':')[0];
      const h=parseInt(t);
      if(!isNaN(h)&&hourMap[h]===undefined) hourMap[h]=l.type;
    });
    const dow=['일','월','화','수','목','금','토'][d.getDay()];
    const cells=Array.from({length:24},(_,h)=>{
      const bg=colorMap[hourMap[h]]||'';
      return `<div class="heat-cell"${bg?` style="background:${bg}"`:''} ></div>`;
    }).join('');
    rows.push(`<div class="heat-row"><span class="heat-day">${dow}</span><div class="heat-cells">${cells}</div></div>`);
  }
  return `<div class="heatmap-wrap"><div class="heatmap-section-title">24시간 패턴</div><div class="heat-axis"><span>0시</span><span>6시</span><span>12시</span><span>18시</span><span>23시</span></div>${rows.join('')}</div>`;
}

function buildActivityChartHTML(logs: Record<string, Log[]>, mode: ReportMode): string {
  const days = mode==='week'?7:30;
  const raw: {label:string;sleepMin:number;feedCount:number;diaperCount:number}[] = [];
  for(let i=days-1;i>=0;i--){
    const d=new Date(); d.setDate(d.getDate()-i);
    const key=localDateStr(d);
    const ls=logs[key]||[];
    const sleepMin=ls.filter(l=>l.type==='sleep'&&l.endTime).reduce((acc,l)=>{let dur=hmToMin(l.endTime!)-hmToMin(l.startTime||'00:00');if(dur<0)dur+=1440;return acc+dur;},0);
    raw.push({label:['일','월','화','수','목','금','토'][d.getDay()],sleepMin,feedCount:ls.filter(l=>l.type==='feed').length,diaperCount:ls.filter(l=>l.type==='pee'||l.type==='poop').length});
  }
  const summary = mode==='week'?raw:[{label:'평균',sleepMin:raw.reduce((s,d)=>s+d.sleepMin,0)/days,feedCount:raw.reduce((s,d)=>s+d.feedCount,0)/days,diaperCount:raw.reduce((s,d)=>s+d.diaperCount,0)/days}];

  // Donut
  const totalSleep=raw.reduce((s,d)=>s+d.sleepMin,0);
  const totalFeed=raw.reduce((s,d)=>s+d.feedCount,0)*30;
  const totalDiaper=raw.reduce((s,d)=>s+d.diaperCount,0)*10;
  const totalAwake=Math.max(0, days*1440-totalSleep-totalFeed-totalDiaper);
  const donutHTML=buildDonutSVG([
    {label:'수면',  value:totalSleep,  color:'#4FAACC'},
    {label:'수유',  value:totalFeed,   color:'#FF8040'},
    {label:'기저귀',value:totalDiaper, color:'#E6BC00'},
    {label:'기타',  value:totalAwake,  color:'#E8E0D8'},
  ]);

  // Heatmap (week only)
  const heatHTML = mode==='week' ? buildHeatmap(logs, 7) : '';

  const maxSleep=Math.max(...summary.map(d=>d.sleepMin),60);
  const maxFeed=Math.max(...summary.map(d=>d.feedCount),1);
  const maxDiaper=Math.max(...summary.map(d=>d.diaperCount),1);
  const barHTML = summary.map(d=>{
    const sw=Math.round((d.sleepMin/maxSleep)*55);
    const fw=Math.round((d.feedCount/maxFeed)*25);
    const dw=Math.round((d.diaperCount/maxDiaper)*20);
    const sleepH=`${Math.floor(d.sleepMin/60)}h${d.sleepMin%60>0?Math.round(d.sleepMin%60)+'m':''}`;
    const tip=`${sleepH} · 수유 ${typeof d.feedCount==='number'?d.feedCount.toFixed(mode==='week'?0:1):d.feedCount}회 · 기저귀 ${typeof d.diaperCount==='number'?d.diaperCount.toFixed(mode==='week'?0:1):d.diaperCount}회`;
    return `<div class="act-row"><div class="act-day">${d.label}</div><div class="act-bar-track" title="${tip}"><div class="act-bar-seg act-sleep-seg" style="width:${sw}%"></div><div class="act-bar-seg act-feed-seg" style="width:${fw}%"></div><div class="act-bar-seg act-diaper-seg" style="width:${dw}%"></div></div><div class="act-label">${tip}</div></div>`;
  }).join('');

  return donutHTML + heatHTML + `<div class="heatmap-section-title" style="margin-top:14px">일별 기록</div>` + barHTML;
}

// ── Milestones ───────────────────────────────────────────────────
const MILESTONES: MilestoneGroup[] = [
  { minM:0,  maxM:1,  title:'1개월 미만',  icon:'🌱', items:[{id:'ms_01_1',text:'빛과 소리에 반응해요'},{id:'ms_01_2',text:'엎드리면 고개를 살짝 들어요'},{id:'ms_01_3',text:'울음으로 의사를 표현해요'},{id:'ms_01_4',text:'엄마 목소리를 알아들어요'}] },
  { minM:1,  maxM:3,  title:'1~2개월',     icon:'😊', items:[{id:'ms_12_1',text:'사회적 미소가 시작돼요'},{id:'ms_12_2',text:'목을 더 오래 들 수 있어요'},{id:'ms_12_3',text:'소리에 고개를 돌려요'},{id:'ms_12_4',text:'옹알이가 시작돼요'}] },
  { minM:3,  maxM:5,  title:'3~4개월',     icon:'🙌', items:[{id:'ms_34_1',text:'목을 잘 가눠요 (목 가누기 완성)'},{id:'ms_34_2',text:'손을 쥐었다 폈다 해요'},{id:'ms_34_3',text:'소리 내어 웃어요'},{id:'ms_34_4',text:'물체를 눈으로 추적해요'},{id:'ms_34_5',text:'뒤집기를 시도해요 (배→등)'}] },
  { minM:5,  maxM:7,  title:'5~6개월',     icon:'🤸', items:[{id:'ms_56_1',text:'양방향 뒤집기가 돼요'},{id:'ms_56_2',text:'장난감을 손으로 집어요'},{id:'ms_56_3',text:'이름을 부르면 반응해요'},{id:'ms_56_4',text:'도움 없이 잠깐 앉을 수 있어요'},{id:'ms_56_5',text:'자음을 포함한 옹알이를 해요'}] },
  { minM:7,  maxM:10, title:'7~9개월',     icon:'🧗', items:[{id:'ms_79_1',text:'혼자서 앉을 수 있어요'},{id:'ms_79_2',text:'기기 시작해요'},{id:'ms_79_3',text:'낯선 사람을 경계해요 (낯가림)'},{id:'ms_79_4',text:'가구를 잡고 서려 해요'},{id:'ms_79_5',text:'짝짜꿍, 빠이빠이를 따라 해요'}] },
  { minM:10, maxM:12, title:'10~11개월',   icon:'🚶', items:[{id:'ms_1012_1',text:'잡고 일어서요'},{id:'ms_1012_2',text:'집게 잡기가 돼요 (엄지+검지)'},{id:'ms_1012_3',text:'첫 단어가 나와요 (엄마, 아빠 등)'},{id:'ms_1012_4',text:'짝짜꿍, 까꿍 게임을 즐겨요'},{id:'ms_1012_5',text:'손가락으로 원하는 것을 가리켜요'}] },
  { minM:12, maxM:18, title:'12~15개월',   icon:'🌟', items:[{id:'ms_1215_1',text:'혼자 서 있을 수 있어요'},{id:'ms_1215_2',text:'첫 걸음마를 시작해요'},{id:'ms_1215_3',text:'컵으로 물을 마셔요'},{id:'ms_1215_4',text:'3~5개 단어를 사용해요'},{id:'ms_1215_5',text:'간단한 지시를 이해해요'}] },
  { minM:18, maxM:25, title:'18~24개월',   icon:'🏃', items:[{id:'ms_1824_1',text:'뛰기 시작해요'},{id:'ms_1824_2',text:'두 단어를 조합해요 (엄마 줘, 아빠 가)'},{id:'ms_1824_3',text:'계단을 기어오르거나 올라가요'},{id:'ms_1824_4',text:'20개 이상의 단어를 사용해요'},{id:'ms_1824_5',text:'혼자 숟가락을 사용해요'}] },
];
function getMilestones(months: number) { return MILESTONES.filter(g => months>=g.minM && months<g.maxM); }

// ── Vaccine/food/check milestones for calendar ───────────────────
interface CalMilestone { m: number; label: string; sub: string; type: 'vaccine'|'food'|'check'; }
const CAL_MILESTONES: CalMilestone[] = [
  { m:0,  label:'BCG 접종',                       sub:'출생 후 4주 이내',              type:'vaccine' },
  { m:0,  label:'B형간염 1차',                    sub:'출생 직후',                     type:'vaccine' },
  { m:1,  label:'B형간염 2차',                    sub:'생후 1개월',                    type:'vaccine' },
  { m:1,  label:'영유아검진 1차',                  sub:'생후 1개월',                    type:'check' },
  { m:2,  label:'DTaP·Hib·PCV·폴리오 1차',        sub:'생후 2개월 — 4종 동시접종',     type:'vaccine' },
  { m:2,  label:'로타바이러스 1차',                sub:'생후 2개월',                    type:'vaccine' },
  { m:2,  label:'영유아검진 2차',                  sub:'생후 2개월',                    type:'check' },
  { m:4,  label:'DTaP·Hib·PCV·폴리오 2차',        sub:'생후 4개월 — 4종 동시접종',     type:'vaccine' },
  { m:4,  label:'로타바이러스 2차',                sub:'생후 4개월',                    type:'vaccine' },
  { m:4,  label:'영유아검진 3차',                  sub:'생후 4개월',                    type:'check' },
  { m:6,  label:'DTaP·Hib·PCV·폴리오·HepB 3차',   sub:'생후 6개월 — 5종 동시접종',     type:'vaccine' },
  { m:6,  label:'로타바이러스 3차',                sub:'생후 6개월 (해당 제품만)',       type:'vaccine' },
  { m:6,  label:'이유식 시작',                     sub:'쌀미음부터 권고, 1일 1회',       type:'food' },
  { m:6,  label:'영유아검진 4차',                  sub:'생후 6개월',                    type:'check' },
  { m:7,  label:'중기 이유식',                     sub:'7~9개월, 다양한 식재료 도입',    type:'food' },
  { m:9,  label:'영유아검진 5차',                  sub:'생후 9개월',                    type:'check' },
  { m:10, label:'후기 이유식',                     sub:'10~12개월, 죽→진밥 전환',       type:'food' },
  { m:12, label:'MMR·수두·Hib·PCV 4차',           sub:'생후 12~15개월',                type:'vaccine' },
  { m:12, label:'A형간염 1차',                     sub:'생후 12~23개월',                type:'vaccine' },
  { m:12, label:'일본뇌염 1차',                    sub:'생후 12개월',                   type:'vaccine' },
  { m:12, label:'완료기 이유식',                   sub:'12개월~, 가족 식사 함께 시작',   type:'food' },
  { m:12, label:'영유아검진 6차',                  sub:'생후 12개월',                   type:'check' },
  { m:15, label:'DTaP 4차',                        sub:'생후 15~18개월',                type:'vaccine' },
  { m:18, label:'영유아검진 7차',                  sub:'생후 18개월',                   type:'check' },
  { m:24, label:'A형간염 2차',                     sub:'1차 접종 후 6개월',             type:'vaccine' },
  { m:24, label:'일본뇌염 2차',                    sub:'1차 접종 후 1개월',             type:'vaccine' },
  { m:24, label:'영유아검진 8차',                  sub:'생후 24개월',                   type:'check' },
  { m:36, label:'영유아검진 9차',                  sub:'생후 36개월',                   type:'check' },
  { m:48, label:'DTaP 5차·폴리오 4차',             sub:'만 4~6세',                      type:'vaccine' },
  { m:48, label:'영유아검진 10차',                 sub:'생후 48개월',                   type:'check' },
  { m:54, label:'영유아검진 11차',                 sub:'생후 54개월',                   type:'check' },
  { m:60, label:'MMR 2차',                         sub:'만 4~6세',                      type:'vaccine' },
  { m:66, label:'영유아검진 12차',                 sub:'생후 66개월',                   type:'check' },
];

function getMilestonesForMonth(birthDateStr: string, year: number, month: number) {
  const events: (CalMilestone & { date: Date })[] = [];
  for (const ms of CAL_MILESTONES) {
    const d = new Date(birthDateStr);
    d.setMonth(d.getMonth() + ms.m);
    if (d.getFullYear() === year && d.getMonth() === month) {
      events.push({ ...ms, date: new Date(d) });
    }
  }
  return events.sort((a, b) => a.date.getTime() - b.date.getTime());
}

// ── Shop keywords ────────────────────────────────────────────────
const SHOP_KEYWORDS: Record<string, string[]> = {
  newborn: ['황달 케어', '신생아 목욕', '배앓이 달래기', '수유 자세', '태열', '영아산통', '모유수유', '신생아 모빌'],
  '1-3':   ['흑백 모빌', '딸랑이', '배앓이', '목 가누기', '사회적 미소', '소프트 토이', '스와들링', '배 놀이'],
  '4-6':   ['이앓이', '치발기', '촉감 놀이', '이유식 준비', '뒤집기 연습', '배 놀이 매트', '오감 장난감', '목욕 장난감'],
  '7-9':   ['이유식', '집게 잡기', '기기 연습', '낯가림', '소리 장난감', '손잡이 컵', '범퍼 침대', '오뚝이'],
  '10-12': ['걸음마 보조', '첫 단어', '컵 연습', '소프트 퍼즐', '잡고 서기', '끌차', '잇몸 간식'],
  toddler: ['역할 놀이', '끌차', '큰 블록', '유아 크레용', '어린이집 가방', '유아 의자', '놀이 매트'],
};
function getShopKeywordsForAge(months: number): string[] {
  if (months < 1)  return SHOP_KEYWORDS.newborn;
  if (months <= 3) return SHOP_KEYWORDS['1-3'];
  if (months <= 6) return SHOP_KEYWORDS['4-6'];
  if (months <= 9) return SHOP_KEYWORDS['7-9'];
  if (months <= 12) return SHOP_KEYWORDS['10-12'];
  return SHOP_KEYWORDS.toddler;
}

// ── Bot helpers ──────────────────────────────────────────────────
function koWeatherDesc(desc: string): string {
  const map: Record<string, string> = {
    'clear sky':'맑음', 'few clouds':'구름 조금', 'scattered clouds':'구름 많음',
    'broken clouds':'흐림', 'overcast clouds':'흐림',
    'light rain':'약한 비', 'moderate rain':'비', 'heavy intensity rain':'강한 비',
    'very heavy rain':'폭우', 'extreme rain':'폭우', 'freezing rain':'진눈깨비',
    'light intensity shower rain':'소나기', 'shower rain':'소나기', 'heavy intensity shower rain':'강한 소나기',
    'light drizzle':'이슬비', 'drizzle':'이슬비', 'heavy intensity drizzle':'강한 이슬비',
    'light intensity drizzle rain':'이슬비', 'drizzle rain':'이슬비',
    'thunderstorm with light rain':'뇌우', 'thunderstorm with rain':'뇌우',
    'thunderstorm with heavy rain':'강한 뇌우', 'thunderstorm':'뇌우',
    'light thunderstorm':'약한 뇌우', 'heavy thunderstorm':'강한 뇌우', 'ragged thunderstorm':'뇌우',
    'light snow':'약한 눈', 'snow':'눈', 'heavy snow':'폭설', 'sleet':'진눈깨비',
    'light shower sleet':'약한 진눈깨비', 'shower sleet':'진눈깨비',
    'light rain and snow':'비와 눈', 'rain and snow':'비와 눈',
    'light shower snow':'약한 눈 소나기', 'shower snow':'눈 소나기', 'heavy shower snow':'강한 눈 소나기',
    'mist':'안개', 'smoke':'연기', 'haze':'실안개', 'dust':'먼지',
    'sand/dust whirls':'먼지바람', 'fog':'짙은 안개', 'sand':'모래바람',
    'volcanic ash':'화산재', 'squalls':'돌풍', 'tornado':'태풍',
  };
  return map[desc.toLowerCase()] ?? desc;
}

function dustLevel(val: number, type: 'pm25' | 'pm10'): { label: string; cls: string } {
  const grade = type === 'pm25'
    ? (val <= 15 ? 0 : val <= 35 ? 1 : val <= 75 ? 2 : 3)
    : (val <= 30 ? 0 : val <= 80 ? 1 : val <= 150 ? 2 : 3);
  const labels = ['좋음', '보통', '나쁨', '매우나쁨'];
  const clss   = ['good', 'normal', 'bad', 'very-bad'];
  return { label: labels[grade], cls: clss[grade] };
}

function makeExtLinks(q: string) {
  const yt=encodeURIComponent(q), dg=encodeURIComponent(q), mg=encodeURIComponent(q);
  return `<div class="ext-links"><a class="ext-btn ext-youtube" href="https://www.youtube.com/results?search_query=${yt}" target="_blank" rel="noopener noreferrer">🎬 YouTube</a><a class="ext-btn ext-daangn" href="https://www.daangn.com/search/${dg}" target="_blank" rel="noopener noreferrer">🥕 당근마켓</a><a class="ext-btn ext-momsguide" href="https://momguide.co.kr/search/?q=${mg}" target="_blank" rel="noopener noreferrer">🧴 맘가이드</a></div>`;
}
function toySuggestions(months: number | null) {
  if(months===null) return '<ul><li>월령에 맞는 장난감을 추천해드려요</li></ul>';
  if(months<3)  return '<ul><li>🎠 흑백 모빌 (시각 발달)</li><li>🔔 딸랑이 (청각 발달)</li><li>🧸 소프트 토이</li></ul>';
  if(months<6)  return '<ul><li>🦷 치발기 (구강기)</li><li>📖 흑백 헝겊 책</li><li>🤸 배 놀이 매트</li></ul>';
  if(months<9)  return '<ul><li>🎯 오뚝이</li><li>🎵 버튼 소리 장난감</li><li>🧱 소프트 블록</li></ul>';
  if(months<12) return '<ul><li>🧩 소프트 블록 세트</li><li>🎹 피아노 매트</li><li>🏀 천 공</li></ul>';
  if(months<18) return '<ul><li>🚗 끌차/밀차</li><li>🧩 간단한 퍼즐 (4~6조각)</li><li>🏺 모양 맞추기 장난감</li></ul>';
  return '<ul><li>🎭 역할놀이 세트</li><li>🧱 큰 블록 (듀플로 등)</li><li>🖍️ 유아용 크레용 + 스케치북</li></ul>';
}
function formulaAdvice(months: number, name: string) {
  if(months<=1) return `<br>💡 <strong>${name}이는 ${months}개월</strong>이에요. 1회 60~90ml, 하루 7~8회 수유가 적당해요.`;
  if(months<=2) return `<br>💡 <strong>${name}이는 ${months}개월</strong>이에요. 1회 90~120ml, 하루 6~7회 수유가 적당해요.`;
  if(months<=4) return `<br>💡 <strong>${name}이는 ${months}개월</strong>이에요. 1회 150~180ml, 하루 5회 수유가 적당해요.`;
  if(months<=6) return `<br>💡 <strong>${name}이는 ${months}개월</strong>이에요. 1회 150~210ml, 하루 4~5회 수유가 적당해요.`;
  return `<br>💡 <strong>${name}이는 ${months}개월</strong>이에요. 이유식과 병행하며 분유량을 서서히 줄여나가요.`;
}
function sleepRec(months: number) {
  if(months<3) return '14~17시간'; if(months<6) return '12~16시간'; if(months<12) return '12~14시간'; return '11~14시간';
}

function getBotResponse(text: string, babyMonths: number | null, babyName: string): string {
  const t = text.toLowerCase();
  if(t.includes('예방접종')||t.includes('접종')||t.includes('백신')||t.includes('bcg')||t.includes('dtap')) {
    if(t.includes('bcg')||t.includes('결핵')) return `<h4>💉 BCG (결핵) 접종</h4><ul><li><strong>접종 시기:</strong> 출생 후 4주 이내 권장</li><li><strong>접종 방법:</strong> 피내 주사 (왼쪽 팔 위쪽)</li><li><strong>비용:</strong> 국가 필수 – 무료</li><li><strong>부작용:</strong> 접종 부위 흉터 (2~3개월 내 형성)</li></ul><strong>💡 팁:</strong> 접종 후 2~3주 뒤 작은 붉은 혹이 생기는 것은 정상이에요.`;
    if(t.includes('로타')||t.includes('rota')) return `<h4>💉 로타바이러스 접종</h4><ul><li><strong>로타릭스 (2가):</strong> 2, 4개월 (2회)</li><li><strong>로타텍 (5가):</strong> 2, 4, 6개월 (3회)</li><li><strong>비용:</strong> 선택 접종 – 유료</li><li><strong>접종 방법:</strong> 경구 복용 (먹는 백신)</li></ul><strong>💡 팁:</strong> 두 종류를 섞어서 맞으면 안 되고, 처음 맞은 종류로 끝까지 맞춰야 해요.`;
    return `<h4>💉 국가 필수 예방접종 일정</h4><table><tr><th>시기</th><th>접종 종류</th></tr><tr><td>출생~4주</td><td>BCG (결핵), B형간염 1차</td></tr><tr><td>1개월</td><td>B형간염 2차</td></tr><tr><td>2개월</td><td>DTaP·폴리오·Hib·폐렴구균·로타 1차</td></tr><tr><td>4개월</td><td>DTaP·폴리오·Hib·폐렴구균·로타 2차</td></tr><tr><td>6개월</td><td>DTaP·폴리오·B형간염 3차</td></tr><tr><td>12~15개월</td><td>MMR·수두·Hib 4차·폐렴구균 4차</td></tr><tr><td>12~23개월</td><td>A형간염 1·2차, 일본뇌염</td></tr><tr><td>15~18개월</td><td>DTaP 4차</td></tr><tr><td>4~6세</td><td>DTaP 5차, 폴리오 4차, MMR 2차</td></tr></table>${babyMonths!==null?`<br><strong>${babyName}이는 현재 ${babyMonths}개월</strong>이에요. 위 표에서 해당 시기를 확인해보세요!`:''}<br>💡 <strong>질병관리청 예방접종도우미 앱</strong>에서 접종 내역을 확인·관리할 수 있어요.`;
  }
  if(t.includes('이유식')||t.includes('solid')||t.includes('레시피')||t.includes('처음 먹')) {
    if(t.includes('레시피')||t.includes('만들')) return `<h4>🥣 초기 이유식 기본 레시피</h4><strong>쌀미음 (생후 6개월~)</strong><ul><li>쌀 10g + 물 100ml</li><li>쌀을 30분 불린 후 믹서에 갈기</li><li>냄비에 약불로 저어가며 10분 익히기</li><li>체에 걸러 부드럽게 완성</li></ul><strong>단호박 미음</strong><ul><li>단호박 20g (껍질 제거) + 쌀미음</li><li>단호박을 쪄서 체에 거른 후 쌀미음에 섞기</li></ul><strong>💡 주의:</strong> 한 가지 재료를 3~4일 먹여 알레르기 반응을 확인하세요!`;
    if(t.includes('시작')||t.includes('언제')) return `<h4>🥣 이유식 시작 시기</h4><ul><li><strong>WHO 권장:</strong> 생후 <strong>6개월</strong>부터 시작</li><li><strong>최소:</strong> 4개월 이전에는 절대 시작하지 않아요</li></ul><strong>이유식 시작 신호:</strong><ul><li>✅ 목을 잘 가눠요</li><li>✅ 도움 받아 앉을 수 있어요</li><li>✅ 음식에 관심을 보여요</li><li>✅ 혀로 음식을 밀어내지 않아요</li></ul>${babyMonths!==null?`<br>💡 <strong>${babyName}이는 ${babyMonths}개월</strong>이에요. ${babyMonths>=6?'이유식을 시작할 수 있는 시기예요!':`약 ${6-babyMonths}개월 후 이유식을 시작하면 돼요.`}`:''}`;
    return `<h4>🥣 이유식 기초 가이드</h4><strong>초기 (6~7개월):</strong> 묽은 미음, 하루 1~2회<br><strong>중기 (7~9개월):</strong> 죽 형태, 하루 2회, 60~120ml<br><strong>후기 (9~12개월):</strong> 무른밥, 하루 3회, 120~180ml<br><strong>⚠️ 첫 돌 전 주의 식품:</strong> 꿀, 생우유, 견과류, 갑각류`;
  }
  if(t.includes('분유')||t.includes('수유량')||t.includes('수유 횟수')) return `<h4>🍼 월령별 분유량 가이드</h4><table><tr><th>월령</th><th>1회 수유량</th><th>하루 횟수</th></tr><tr><td>0~1개월</td><td>60~90ml</td><td>7~8회</td></tr><tr><td>1~2개월</td><td>90~120ml</td><td>6~7회</td></tr><tr><td>2~3개월</td><td>120~150ml</td><td>5~6회</td></tr><tr><td>3~4개월</td><td>150~180ml</td><td>5회</td></tr><tr><td>4~6개월</td><td>150~210ml</td><td>4~5회</td></tr><tr><td>6개월~</td><td>이유식 병행, 서서히 감소</td><td>3~4회</td></tr></table>${babyMonths!==null?formulaAdvice(babyMonths,babyName):''}<br>💡 <strong>적정 수유량 공식:</strong> 체중(kg) × 150~200ml = 하루 총 수유량`;
  if(t.includes('모유')||t.includes('젖')) return `<h4>🤱 모유수유 가이드</h4><ul><li><strong>수유 빈도:</strong> 생후 초기 2~3시간마다 (하루 8~12회)</li><li><strong>수유 시간:</strong> 한 쪽 10~20분, 양쪽 번갈아가며</li><li><strong>충분한 수유 확인:</strong> 하루 소변 6회 이상, 체중 증가</li></ul><strong>모유 보관:</strong><ul><li>실온: 4시간 이내</li><li>냉장: 3~5일</li><li>냉동: 3~6개월</li></ul>`;
  if(t.includes('수면')||t.includes('잠')||t.includes('수면 교육')||t.includes('통잠')) {
    if(t.includes('교육')||t.includes('통잠')) return `<h4>😴 수면 교육 가이드</h4><strong>월령별 수면 시간:</strong><ul><li>0~3개월: 14~17시간 (불규칙)</li><li>4~6개월: 12~16시간, 밤 통잠 가능</li><li>6~12개월: 12~14시간, 낮잠 2~3회</li></ul><strong>수면 환경:</strong><ul><li>✅ 일정한 수면 루틴 (목욕→수유→책→취침)</li><li>✅ 어둡고 조용한 환경 (백색소음 도움)</li><li>✅ 적정 온도 20~22℃</li></ul><strong>수면 교육법:</strong><ul><li><strong>페이딩법:</strong> 점점 개입을 줄이는 방법</li><li><strong>퍼버법:</strong> 점진적 소거법 (4~6개월 이후)</li></ul>`;
    return `<h4>😴 월령별 수면 패턴</h4><table><tr><th>월령</th><th>총 수면</th><th>밤잠</th><th>낮잠</th></tr><tr><td>0~1개월</td><td>14~17h</td><td>불규칙</td><td>불규칙</td></tr><tr><td>2~3개월</td><td>14~16h</td><td>4~6h</td><td>3~4회</td></tr><tr><td>4~6개월</td><td>12~15h</td><td>6~8h</td><td>2~3회</td></tr><tr><td>6~9개월</td><td>12~14h</td><td>8~10h</td><td>2회</td></tr><tr><td>9~12개월</td><td>12~13h</td><td>9~11h</td><td>1~2회</td></tr></table>${babyMonths!==null?`<br>💡 <strong>${babyName}이는 ${babyMonths}개월</strong>이니까 하루 약 ${sleepRec(babyMonths)} 수면이 필요해요.`:''}`;
  }
  if(t.includes('발달')||t.includes('뒤집기')||t.includes('걷기')||t.includes('옹알이')||t.includes('앉기')) {
    if(babyMonths!==null) {
      const gs=getMilestones(babyMonths);
      if(gs.length>0) {
        const g=gs[0], items=g.items.map(i=>`<li>${i.text}</li>`).join(''), sq=`${babyMonths}개월 아기 발달 장난감`;
        return `<h4>👶 ${babyName}이의 발달 체크 (${babyMonths}개월)</h4><strong>${g.icon} 이 시기에 할 수 있어야 해요:</strong><ul>${items}</ul><br>💡 건강 탭 → 발달체크에서 체크리스트를 확인해보세요!<br><br>⚠️ 발달이 걱정된다면 <strong>소아과 전문의</strong>에게 상담받아보세요.<br><br>🎮 <strong>이 시기 장난감 찾기:</strong>${makeExtLinks(sq)}`;
      }
    }
    return `<h4>👶 주요 발달 이정표</h4><ul><li><strong>2개월:</strong> 사회적 미소, 목 들기</li><li><strong>4개월:</strong> 소리 내어 웃기, 뒤집기 시도</li><li><strong>6개월:</strong> 뒤집기, 도움 받아 앉기, 옹알이</li><li><strong>9개월:</strong> 혼자 앉기, 기기, 낯가림</li><li><strong>12개월:</strong> 잡고 서기, 첫 단어, 집게 잡기</li><li><strong>15개월:</strong> 혼자 걷기, 4~6 단어</li><li><strong>24개월:</strong> 뛰기, 두 단어 조합</li></ul>`;
  }
  if(t.includes('피부')||t.includes('발진')||t.includes('태열')||t.includes('아토피')) return `<h4>🔴 아기 피부 트러블 가이드</h4><strong>신생아 여드름</strong><ul><li>생후 2~4주 정상적인 반응, 자연 소실</li></ul><strong>기저귀 발진</strong><ul><li>기저귀를 자주 갈아주고 엉덩이를 건조하게 유지</li><li>48시간 내 호전 없으면 소아과 방문</li></ul><strong>태열 / 영아 습진</strong><ul><li>보습제를 하루 2회 이상 충분히 발라요</li><li>증상 심하면 소아과 방문</li></ul>`;
  if(t.includes('열')||t.includes('체온')||t.includes('발열')||t.includes('해열')) return `<h4>🌡️ 아기 열 대처 가이드</h4><strong>정상 체온:</strong> 36.5~37.5℃<br><br><strong>열 단계별 대응:</strong><ul><li><strong>37.5~38℃:</strong> 경과 관찰, 수분 공급</li><li><strong>38~38.5℃:</strong> 옷 느슨하게, 미지근한 물 수건</li><li><strong>38.5℃ 이상:</strong> 해열제 사용 (타이레놀 시럽)</li></ul><strong>즉시 병원 방문:</strong><ul><li>⚠️ 생후 3개월 미만 38℃ 이상</li><li>⚠️ 39℃ 이상 2일 이상 지속</li></ul>`;
  if(t.includes('배앓이')||t.includes('콜릭')||t.includes('많이 울')) return `<h4>😭 영아 배앓이 (콜릭) 대처법</h4><strong>콜릭이란?</strong><ul><li>생후 2주~3~4개월에 하루 3시간 이상 이유 없이 울음</li><li>4개월 이후 자연스럽게 호전</li></ul><strong>달래는 방법:</strong><ul><li>🤱 세로로 안고 부드럽게 흔들기</li><li>🎶 백색소음 (청소기, 선풍기 소리)</li><li>🚗 카시트에 태우고 드라이브</li><li>💆 배를 시계 방향으로 마사지</li></ul>💡 부모도 지치면 잠깐 자리를 비워 숨 고르기를 해요.`;
  if(t.includes('장난감')||t.includes('교구')||t.includes('놀이')||t.includes('추천')) {
    const sq=babyMonths!==null?`${babyMonths}개월 아기 발달 장난감`:'아기 발달 장난감 추천';
    return `<h4>🎮 ${babyMonths!==null?babyMonths+'개월 ':''}아기 장난감 추천</h4><strong>이 시기 발달에 좋은 장난감:</strong>${toySuggestions(babyMonths)}<br>🔍 <strong>직접 찾아보기:</strong>${makeExtLinks(sq)}`;
  }
  if(t.includes('안전')||t.includes('추락')||t.includes('질식')) return `<h4>🛡️ 영아 안전 수칙</h4><strong>수면 안전:</strong><ul><li>아기는 등을 바닥에 대고 단단한 침대에서 재워요</li><li>소프트 침구, 베개, 범퍼는 사용하지 않아요</li></ul><strong>일반 안전:</strong><ul><li>차 안에서는 항상 카시트를 사용해요</li><li>욕조에서 절대 눈을 떼지 않아요</li><li>작은 물건, 코드, 비닐봉지 주의</li></ul>`;
  const basics=[
    {keys:['안녕','처음','시작'],ans:`안녕하세요! 😊 저는 ${babyName}의 기록 도우미예요.<br>무엇이든 편하게 물어보세요!<br><br>💡 아래 주제들을 물어보실 수 있어요:<br>💉 예방접종 일정 · 🥣 이유식 · 🍼 분유량 · 😴 수면 · 👶 발달 · 🌡️ 열 대처`},
    {keys:['고마','감사','도움'],ans:'도움이 됐다니 기뻐요! 💛<br>육아 하시느라 정말 고생이 많으세요. 언제든 물어보세요!'},
    {keys:['힘들','지쳐','피곤','못 자'],ans:'😢 정말 수고 많으세요.<br>육아는 세상에서 가장 힘든 일 중 하나예요.<br>잠깐이라도 쉴 시간을 꼭 만들어보세요. 파이팅! 💪'},
  ];
  for(const b of basics) { if(b.keys.some(k=>t.includes(k))) return b.ans; }
  return `아직 그 내용은 잘 모르지만 도움이 되고 싶어요! 😊<br><br>아래 주제로 질문해 보시겠어요?<br>💉 예방접종 · 🥣 이유식 · 🍼 분유량 · 😴 수면 · 👶 발달 · 🌡️ 열 대처`;
}

async function searchRAG(query: string): Promise<{ chunks: RagChunk[]; figures: RagFigure[] }> {
  try {
    const res = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, topChunks: 5, topFigures: 3 }),
    });
    if (!res.ok) throw new Error(`API ${res.status}`);
    return await res.json();
  } catch {
    return { chunks: [], figures: [] };
  }
}

function renderSources(chunks: RagChunk[], figures: RagFigure[]): string {
  // 같은 책의 페이지를 묶어서 표시
  const sourcePages = new Map<string, Set<number>>();
  for (const c of chunks) {
    const src = c.metadata.source;
    if (!sourcePages.has(src)) sourcePages.set(src, new Set());
    if (c.metadata.page) sourcePages.get(src)!.add(c.metadata.page);
  }
  const refs = [...sourcePages.entries()].map(([src, pages]) => {
    const pageStr = pages.size > 0
      ? ' p.' + [...pages].sort((a,b)=>a-b).join(', p.')
      : '';
    return `<span class="rag-ref">📖 ${escHtml(src)}${pageStr}</span>`;
  });
  const figHtml = figures.map(f => {
    const page = f.metadata.page ? ` (p.${f.metadata.page})` : '';
    const img = f.image ? `<img src="/api/figures/${f.image}" class="rag-fig-img" alt="${escHtml(f.title)}" loading="lazy">` : '';
    return `<div class="rag-figure">${img}<div class="rag-fig-title">${escHtml(f.title)}${page}</div><div class="rag-fig-source">출처: ${escHtml(f.metadata.source)}</div></div>`;
  }).join('');
  if (!refs.length && !figHtml) return '';
  return `<div class="rag-sources"><div class="rag-refs">${refs.join('')}</div>${figHtml ? `<div class="rag-figures">${figHtml}</div>` : ''}</div>`;
}

// ── Main Component ────────────────────────────────────────────────
export default function BabyApp() {
  const [mounted, setMounted] = useState(false);
  const [appState, setAppState] = useState<AppState>(defaultState);
  const [currentPage, setCurrentPage] = useState<Page>('home');
  const [modal, setModal] = useState<ModalState>(null);

  // API keys (user-provided)
  const [userOpenAIKey, setUserOpenAIKey] = useState('');
  const [userYoutubeKey, setUserYoutubeKey] = useState('');
  const [showOpenAIKey, setShowOpenAIKey] = useState(false);
  const [showYoutubeKey, setShowYoutubeKey] = useState(false);
  const userOpenAIKeyRef = useRef('');
  const userYoutubeKeyRef = useRef('');

  // Log detail / edit
  const [selectedLog, setSelectedLog] = useState<(Log & { dateKey: string }) | null>(null);
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [editingLogDateKey, setEditingLogDateKey] = useState('');

  // Add log form
  const [addLogType, setAddLogType] = useState<LogType>('sleep');
  const [lfStart, setLfStart] = useState('');
  const [lfEnd, setLfEnd] = useState('');
  const [lfTime, setLfTime] = useState('');
  const [lfAmount, setLfAmount] = useState('');
  const [lfFeedType, setLfFeedType] = useState('분유');
  const [lfColor, setLfColor] = useState('노란색');
  const [lfReason, setLfReason] = useState('');
  const [lfNote, setLfNote] = useState('');
  const [lfHeight, setLfHeight] = useState('');
  const [lfWeight, setLfWeight] = useState('');

  // Health modal form
  const [healthModalMode, setHealthModalMode] = useState<HealthModalMode>('health');
  const [hfType, setHfType] = useState<HealthLogType>('temp');
  const [hfDetail, setHfDetail] = useState('');
  const [hfDate, setHfDate] = useState('');
  const [hfTime2, setHfTime2] = useState('');
  const [hfMedname, setHfMedname] = useState('');
  const [hfDose, setHfDose] = useState('');
  const [hfFreq, setHfFreq] = useState('');
  const [hfMedNote, setHfMedNote] = useState('');
  const [hfMedDate, setHfMedDate] = useState('');
  const [isMedOcrLoading, setIsMedOcrLoading] = useState(false);

  // Baby photo
  const [babyPhoto, setBabyPhoto] = useState<string|null>(null);
  const photoInputRef = useRef<HTMLInputElement|null>(null);

  // Setup form
  const [setupGender, setSetupGender] = useState<'boy' | 'girl'>('girl');
  const setupNameRef = useRef<HTMLInputElement>(null);
  const setupBirthRef = useRef<HTMLInputElement>(null);

  // Page state
  const [timelineDate, setTimelineDate] = useState(() => todayStr());
  const [voiceSleepStart, setVoiceSleepStart] = useState<{logId:string; time:string} | null>(null);
  const [voiceFeedStart, setVoiceFeedStart] = useState<{logId:string; time:string; amount:number; feedType:string} | null>(null);
  const [quickFeedOpen,   setQuickFeedOpen]   = useState(false);
  const [quickDiaperOpen, setQuickDiaperOpen] = useState(false);
  const [quickOtherOpen,  setQuickOtherOpen]  = useState(false);
  const closeQuickMenus = () => { setQuickFeedOpen(false); setQuickDiaperOpen(false); setQuickOtherOpen(false); };
  const [todoFilter, setTodoFilter] = useState<TodoFilter>('all');
  const [todoCat, setTodoCat] = useState<TodoCat>('vaccine');
  const [todoDate, setTodoDate] = useState(() => todayStr());
  const [healthTab, setHealthTab] = useState<HealthTab>('report');
  const todoInputRef = useRef<HTMLInputElement>(null);

  // Report
  const [reportMode, setReportMode] = useState<ReportMode>('week');

  const [showGrowthForm, setShowGrowthForm] = useState(false);
  const [gDate, setGDate] = useState('');
  const [gHeight, setGHeight] = useState('');
  const [gWeight, setGWeight] = useState('');

  // Share overlay
  const [shareOverlay, setShareOverlay] = useState(false);

  // Voice overlay
  const [voiceOverlay, setVoiceOverlay] = useState(false);

  // Chat
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatBotReady, setChatBotReady] = useState(false);
  const chatMessagesRef = useRef<HTMLDivElement>(null);

  // Voice recognition
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  // YouTube (info page)
  const [ytView, setYtView] = useState<'home'|'list'>('home');
  const [ytRefetchTrigger, setYtRefetchTrigger] = useState(0);
  const [ytSelectedCat, setYtSelectedCat] = useState<YtCat|null>(null);
  const [ytRepVideos, setYtRepVideos] = useState<Record<string,YtVideo>>({});
  const [ytRepLoading, setYtRepLoading] = useState(false);
  const [ytListVideos, setYtListVideos] = useState<YtVideo[]>([]);
  const [ytListLoading, setYtListLoading] = useState(false);
  const [ytListMoreLoading, setYtListMoreLoading] = useState(false);
  const [ytListNextPage, setYtListNextPage] = useState<string|null>(null);
  const [ytListQuery, setYtListQuery] = useState('');
  const [ytListSort, setYtListSort] = useState('relevance');
  const ytSentinelRef = useRef<HTMLDivElement|null>(null);

  // Weather
  const [weather, setWeather] = useState<{temp:number;desc:string;icon:string;humidity:number|null;city:string;aqi:number|null;pm25:number|null;pm10:number|null}|null>(null);

  // Calendar
  const [calYear, setCalYear] = useState(() => new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth());

  // Keyword picker overlay
  const [kwPickerOpen, setKwPickerOpen] = useState(false);
  const [kwPickerKeyword, setKwPickerKeyword] = useState('');

  // Voice processing (GPT intent routing)
  const [voiceProcessing, setVoiceProcessing] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');

  const startVoiceRecognition = useCallback(() => {
    const SpeechRecognition = (window as Window & { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor }).SpeechRecognition || (window as Window & { webkitSpeechRecognition?: SpeechRecognitionCtor }).webkitSpeechRecognition;
    if (!SpeechRecognition) { alert('이 브라우저는 음성 인식을 지원하지 않습니다.'); return; }
    if (isRecording) { recognitionRef.current?.stop(); return; }
    const recognition = new SpeechRecognition();
    recognition.lang = 'ko-KR';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (e: SpeechRecognitionEvent) => {
      const transcript = e.results[0][0].transcript;
      setLfNote(prev => prev ? prev + ' ' + transcript : transcript);
    };
    recognition.onerror = () => setIsRecording(false);
    recognition.onend = () => setIsRecording(false);
    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
  }, [isRecording]);

  // Toast
  const [toast, setToast] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Timeline
  const timelineScrollRef = useRef<HTMLDivElement>(null);
  const [headerDate, setHeaderDate] = useState('');

  // Load from DB via API
  useEffect(() => {
    const storedBabyId = localStorage.getItem('baby_id');
    const stateUrl = storedBabyId ? `/api/state?babyId=${storedBabyId}` : null;
    (stateUrl
      ? fetch(stateUrl).then(r => r.ok ? r.json() : null).then(data => { if (data) setAppState(Object.assign(defaultState(), data)); }).catch(() => {})
      : Promise.resolve()
    ).finally(() => setMounted(true));
    const saved = localStorage.getItem('baby_photo');
    if (saved) setBabyPhoto(saved);
    const oaiKey = localStorage.getItem('user_openai_key') || '';
    const ytKey = localStorage.getItem('user_youtube_key') || '';
    setUserOpenAIKey(oaiKey);
    setUserYoutubeKey(ytKey);
    userOpenAIKeyRef.current = oaiKey;
    userYoutubeKeyRef.current = ytKey;
  }, []);

  useEffect(() => { userOpenAIKeyRef.current = userOpenAIKey; }, [userOpenAIKey]);
  useEffect(() => { userYoutubeKeyRef.current = userYoutubeKey; }, [userYoutubeKey]);

  // 아기 이름 변경 시 브라우저 탭 타이틀 업데이트
  useEffect(() => {
    const name = appState.baby?.name;
    document.title = name ? `${name}의 기록` : '아기의 기록';
  }, [appState.baby?.name]);

  // Header date updater
  useEffect(() => {
    function update() {
      const d = new Date();
      const months = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
      const days = ['일요일','월요일','화요일','수요일','목요일','금요일','토요일'];
      setHeaderDate(`${months[d.getMonth()]} ${d.getDate()}일\n${days[d.getDay()]}`);
    }
    update();
    const t = setInterval(update, 60000);
    return () => clearInterval(t);
  }, []);

  // Show setup modal if no baby after load
  useEffect(() => {
    if (mounted && !appState.baby) setModal('setup');
  }, [mounted, appState.baby]);

  // Timeline scroll
  useEffect(() => {
    if (currentPage !== 'timeline') return;
    const el = timelineScrollRef.current;
    if (!el) return;
    const target = timelineDate === todayStr()
      ? Math.max(0, (new Date().getHours() * 60 + new Date().getMinutes()) - 120)
      : 6 * 60;
    setTimeout(() => { el.scrollTop = target; }, 50);
  }, [currentPage, timelineDate]);

  // Chat scroll
  useEffect(() => {
    if (chatMessagesRef.current)
      setTimeout(() => { chatMessagesRef.current!.scrollTop = chatMessagesRef.current!.scrollHeight; }, 30);
  }, [chatMessages]);

  // Weather fetch on mount
  useEffect(() => {
    fetch('/api/weather?city=Seoul')
      .then(r => r.json())
      .then(d => { if (!d.error) setWeather(d); })
      .catch(() => {});
  }, []);

  // YouTube: load representative videos when info home opens
  useEffect(() => {
    if (currentPage !== 'info' || ytView !== 'home') return;
    if (Object.keys(ytRepVideos).length > 0) return;
    const stage = appState.baby ? ytAgeStage(getAgeInfo(appState.baby.birthDate).months) : '4-6m';
    setYtRepLoading(true);
    let done = 0;
    YT_CATS.forEach(cat => {
      const cacheKey = `rep_${cat.id}_${stage}`;
      const cached = ytGetCache(cacheKey);
      if (cached) {
        setYtRepVideos(prev => ({ ...prev, [cat.id]: cached as YtVideo }));
        done++;
        if (done === YT_CATS.length) setYtRepLoading(false);
        return;
      }
      fetch(`/api/youtube?q=${encodeURIComponent(cat.queries[0])}&maxResults=1&order=${cat.sortOrder}`, { headers: userYoutubeKeyRef.current ? { 'x-youtube-key': userYoutubeKeyRef.current } : {} })
        .then(r => r.json())
        .then(data => {
          const v = (data.videos as YtVideo[])?.[0];
          if (v) { ytSetCache(cacheKey, v); setYtRepVideos(prev => ({ ...prev, [cat.id]: v })); }
        })
        .catch(() => {})
        .finally(() => { done++; if (done === YT_CATS.length) setYtRepLoading(false); });
    });
  }, [currentPage, ytView, ytRefetchTrigger]);

  // YouTube: fetch category video list
  const ytFetchList = useCallback((cat: YtCat, query: string, sort: string, pageToken?: string) => {
    const cacheKey = `list_${cat.id}_${query}_${sort}`;
    if (!pageToken) {
      const cached = ytGetCache(cacheKey) as { videos: YtVideo[]; nextPageToken: string|null } | null;
      if (cached) {
        setYtListVideos(cached.videos);
        setYtListNextPage(cached.nextPageToken);
        setYtListLoading(false);
        return;
      }
      setYtListLoading(true);
      setYtListVideos([]);
    }
    const url = `/api/youtube?q=${encodeURIComponent(query)}&maxResults=12&order=${sort}${pageToken ? `&pageToken=${pageToken}` : ''}`;
    fetch(url, { headers: userYoutubeKeyRef.current ? { 'x-youtube-key': userYoutubeKeyRef.current } : {} })
      .then(r => r.json())
      .then(data => {
        const videos = (data.videos as YtVideo[]) || [];
        const next = (data.nextPageToken as string|null) || null;
        if (!pageToken) {
          ytSetCache(cacheKey, { videos, nextPageToken: next });
          setYtListVideos(videos);
        } else {
          setYtListVideos(prev => [...prev, ...videos]);
        }
        setYtListNextPage(next);
      })
      .catch(() => {})
      .finally(() => { setYtListLoading(false); setYtListMoreLoading(false); });
  }, []);

  // YouTube: infinite scroll
  useEffect(() => {
    if (!ytSentinelRef.current || !ytListNextPage || ytListMoreLoading || !ytSelectedCat) return;
    const cat = ytSelectedCat;
    const io = new IntersectionObserver(entries => {
      if (!entries[0].isIntersecting) return;
      setYtListMoreLoading(true);
      ytFetchList(cat, ytListQuery, ytListSort, ytListNextPage);
    }, { threshold: 0.1 });
    io.observe(ytSentinelRef.current);
    return () => io.disconnect();
  }, [ytListNextPage, ytListMoreLoading, ytListQuery, ytListSort, ytSelectedCat, ytFetchList]);

  const ytOpenCategory = useCallback((cat: YtCat) => {
    const q = cat.queries[0];
    setYtSelectedCat(cat);
    setYtListQuery(q);
    setYtListSort(cat.sortOrder);
    setYtListNextPage(null);
    setYtView('list');
    ytFetchList(cat, q, cat.sortOrder);
  }, [ytFetchList]);

  // ── Helpers ──────────────────────────────────────────────────
  const saveAppState = useCallback((s: AppState) => {
    setAppState(s);
  }, []);

  const showToast = useCallback((msg: string, duration = 2400) => {
    setToast(msg); setToastVisible(true);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastVisible(false), duration);
  }, []);

  // ── Report download / share ───────────────────────────────────
  const handleDownload = useCallback(() => {
    const el = document.getElementById('rpt-print-area');
    if (!el) return;

    const headStyles = Array.from(document.head.querySelectorAll('style, link[rel="stylesheet"]'))
      .map(e => e.outerHTML).join('\n');

    const win = window.open('', '_blank', 'width=960,height=700');
    if (!win) { window.print(); return; }

    win.document.write(`<!DOCTYPE html><html><head>
<meta charset="utf-8"><title>육아 리포트</title>
${headStyles}
<style>
  body { background:#fff; margin:0; padding:16px 20px;
    font-family:-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Noto Sans KR',sans-serif; }
  #rpt-print-area { height:auto; overflow:visible; display:flex; flex-direction:column; gap:0; }
  .rpt-print-cols { display:grid !important; grid-template-columns:1fr 1fr; gap:14px; align-items:start; }
  .rpt-col-left, .rpt-col-right { display:block !important; }
  .section-card { box-shadow:none; border:1px solid #e8e0d8; margin-bottom:12px;
    padding:10px 12px; break-inside:avoid; border-radius:12px; }
  .rpt-hero { background:linear-gradient(135deg,#FFF3EB 0%,#EDFAEC 100%); }
  .rpt-actions, .rpt-seg, .growth-form, .btn-secondary,
  .growth-rec-del, .h-tab-bar { display:none !important; }
  .donut-wrap { padding:8px 0 4px; }
  .heatmap-wrap { margin:4px 0; }
  .heat-cell { height:11px; }
</style>
</head><body>${el.outerHTML}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 700);
  }, []);

  const handleShare = useCallback(async () => {
    const babyName = appState.baby?.name ?? '아기';
    const months = appState.baby ? getAgeInfo(appState.baby.birthDate).months : 0;
    const text = `${babyName} (${months}개월) 육아 리포트\n${babyName}의 기록 앱에서 확인해보세요!`;
    if (navigator.share) {
      try { await navigator.share({ title: `${babyName} 육아 리포트`, text }); } catch { /* cancelled */ }
    } else {
      setShareOverlay(true);
    }
  }, [appState.baby]);

  // ── Baby photo ────────────────────────────────────────────────
  const handlePhotoChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const src = ev.target?.result as string;
      const img = new Image();
      img.onload = () => {
        const MAX = 400;
        const scale = Math.min(1, MAX / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        setBabyPhoto(dataUrl);
        localStorage.setItem('baby_photo', dataUrl);
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }, []);

  // ── Navigation ────────────────────────────────────────────────
  const navigate = (page: Page) => {
    setCurrentPage(page);
    if (page === 'chat' && !chatBotReady) {
      setChatBotReady(true);
      setChatMessages([{ id: uid(), role: 'bot', html: `안녕하세요! 👋<br>${appState.baby?.name || '아기'}의 기록 도우미예요.<br>예방접종, 이유식, 분유량, 발달 등 궁금한 것을 무엇이든 물어보세요!` }]);
    }
  };

  // ── Log ──────────────────────────────────────────────────────
  const openAddLog = (type: LogType, initFeedType?: string) => {
    const now = nowHHMM(), end = minToHM((hmToMin(now) + 60) % 1440);
    setEditingLogId(null);
    setAddLogType(type); setLfStart(now); setLfEnd(end); setLfTime(now);
    setLfAmount(''); setLfFeedType(initFeedType || '분유'); setLfColor('노란색'); setLfReason(''); setLfNote('');
    setLfHeight(''); setLfWeight('');
    setModal('addLog');
  };

  const saveLog = () => {
    const isEdit = !!editingLogId;
    const dateKey = isEdit ? editingLogDateKey : (currentPage === 'timeline' ? timelineDate : todayStr());
    const log: Log = { id: editingLogId || uid(), type: addLogType, date: dateKey, note: lfNote.trim() };
    if (addLogType === 'sleep' || addLogType === 'cry' || addLogType === 'walk' || addLogType === 'play' || addLogType === 'bath') {
      if (!lfStart) { showToast('시작 시간을 입력해주세요'); return; }
      log.startTime = lfStart; if (lfEnd) log.endTime = lfEnd;
    } else if (addLogType !== 'measure') {
      if (!lfTime) { showToast('시간을 입력해주세요'); return; }
      log.time = lfTime; log.startTime = lfTime;
    } else {
      log.time = lfTime || nowHHMM(); log.startTime = log.time;
    }
    if (addLogType === 'feed') { log.amount = parseInt(lfAmount||'0')||null; log.feedType = lfFeedType; }
    if (addLogType === 'poop') log.color = lfColor;
    if (addLogType === 'cry')  log.reason = lfReason;
    if (addLogType === 'other' && !lfNote.trim()) { showToast('내용을 입력해주세요'); return; }
    if (addLogType === 'measure') {
      const h = parseFloat(lfHeight), w = parseFloat(lfWeight);
      if (isNaN(h) && isNaN(w)) { showToast('키 또는 몸무게를 입력해주세요'); return; }
      log.note = [!isNaN(h)?`키 ${h}cm`:null, !isNaN(w)?`몸무게 ${w}kg`:null].filter(Boolean).join(' · ');
    }

    const ns = { ...appState };
    if (addLogType === 'measure') {
      const h = parseFloat(lfHeight), w = parseFloat(lfWeight);
      const existing = ns.growth.find(r => r.date === dateKey);
      if (existing) {
        if (!isNaN(h)) existing.height = h;
        if (!isNaN(w)) existing.weight = w;
      } else {
        ns.growth = [...ns.growth, { id: uid(), date: dateKey, height: isNaN(h)?undefined:h, weight: isNaN(w)?undefined:w }];
      }
    }
    if (!ns.logs[dateKey]) ns.logs[dateKey] = [];
    const sorted = (arr: Log[]) => arr.sort((a,b)=>(a.startTime||a.time||'').localeCompare(b.startTime||b.time||''));
    if (isEdit) {
      ns.logs[dateKey] = sorted(ns.logs[dateKey].map(l => l.id === editingLogId ? log : l));
      saveAppState(ns); setModal(null); setEditingLogId(null);
      showToast(`✏️ ${TYPE_LABELS[addLogType]} 기록이 수정됐어요!`);
      fetch(`/api/logs/${editingLogId}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(log) }).catch(console.error);
    } else {
      ns.logs[dateKey] = sorted([...ns.logs[dateKey], log]);
      saveAppState(ns); setModal(null);
      showToast(`${TYPE_ICONS[addLogType]} ${TYPE_LABELS[addLogType]} 기록이 저장됐어요!`);
      fetch('/api/logs', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ ...log, babyId: appState.babyId }) }).catch(console.error);
    }
  };

  const deleteLog = (dateKey: string, id: string) => {
    if (!confirm('이 기록을 삭제할까요?')) return;
    const ns = { ...appState };
    ns.logs[dateKey] = (ns.logs[dateKey] || []).filter(l => l.id !== id);
    saveAppState(ns); setModal(null); showToast('기록이 삭제됐어요');
    fetch(`/api/logs/${id}`, { method:'DELETE' }).catch(console.error);
  };

  const openLogDetail = (dateKey: string, log: Log) => {
    setSelectedLog({ ...log, dateKey });
    setModal('logDetail');
  };

  const openEditLog = () => {
    if (!selectedLog) return;
    setEditingLogId(selectedLog.id);
    setEditingLogDateKey(selectedLog.dateKey);
    setAddLogType(selectedLog.type);
    setLfStart(selectedLog.startTime || '');
    setLfEnd(selectedLog.endTime || '');
    setLfTime(selectedLog.time || '');
    setLfAmount(selectedLog.amount?.toString() || '');
    setLfFeedType(selectedLog.feedType || '분유');
    setLfColor(selectedLog.color || '노란색');
    setLfReason(selectedLog.reason || '');
    setLfNote(selectedLog.note || '');
    setLfHeight((selectedLog.note?.match(/키 ([\d.]+)cm/)||[])[1]||'');
    setLfWeight((selectedLog.note?.match(/몸무게 ([\d.]+)kg/)||[])[1]||'');
    setModal('addLog');
  };

  // ── Health ───────────────────────────────────────────────────
  const openHealthModal = (mode: HealthModalMode) => {
    setHealthModalMode(mode);
    setHfDetail(''); setHfDate(todayStr()); setHfTime2(nowHHMM());
    setHfMedname(''); setHfDose(''); setHfFreq(''); setHfMedNote(''); setHfMedDate(todayStr());
    setModal('healthLog');
  };
  const saveHealthLog = () => {
    if (!hfDetail.trim()) { showToast('내용을 입력해주세요'); return; }
    const newLog = { id:uid(), type:hfType, detail:hfDetail.trim(), date:hfDate, time:hfTime2 };
    const ns = { ...appState, health: { ...appState.health } };
    ns.health.logs = [...(ns.health.logs||[]), newLog];
    saveAppState(ns); setModal(null); showToast('🌡️ 건강 기록이 저장됐어요!');
    fetch('/api/health/logs', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ ...newLog, babyId: appState.babyId }) }).catch(console.error);
  };
  const saveMedication = () => {
    if (!hfMedname.trim()) { showToast('약 이름을 입력해주세요'); return; }
    const newMed = { id:uid(), name:hfMedname.trim(), dose:hfDose, freq:hfFreq, note:hfMedNote, date:hfMedDate };
    const ns = { ...appState, health: { ...appState.health } };
    ns.health.medications = [...(ns.health.medications||[]), newMed];
    saveAppState(ns); setModal(null); showToast('💊 복약 정보가 저장됐어요!');
    fetch('/api/health/medications', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ ...newMed, babyId: appState.babyId }) }).catch(console.error);
  };

  // ── Todo ─────────────────────────────────────────────────────
  const addTodo = () => {
    const text = todoInputRef.current?.value.trim() || '';
    if (!text) { showToast('내용을 입력해주세요'); return; }
    const naturalDate = parseNaturalDate(text);
    const resolvedDate = naturalDate || todoDate;
    if (naturalDate) {
      setTodoDate(naturalDate);
      // 달력을 해당 월로 자동 이동
      const [ry, rm] = naturalDate.split('-').map(Number);
      setCalYear(ry); setCalMonth(rm - 1);
    }
    const newTodo = { id:uid(), text, category:todoCat, completed:false, createdAt:Date.now(), date:resolvedDate };
    const ns = { ...appState };
    ns.todos = [newTodo, ...ns.todos];
    saveAppState(ns); if (todoInputRef.current) todoInputRef.current.value = '';
    const [,dm,dd] = resolvedDate.split('-').map(Number);
    const days = ['일','월','화','수','목','금','토'];
    const dotw = days[new Date(resolvedDate).getDay()];
    showToast(naturalDate ? `📅 ${dm}/${dd}(${dotw}) 달력에 추가됐어요!` : '✅ 항목이 추가됐어요!');
    fetch('/api/todos', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ ...newTodo, babyId: appState.babyId }) }).catch(console.error);
  };
  const toggleTodo = (id: string) => {
    const ns = { ...appState };
    ns.todos = ns.todos.map(t => t.id===id?{...t,completed:!t.completed}:t);
    const t = ns.todos.find(t => t.id===id);
    saveAppState(ns); showToast(t?.completed?'✓ 완료 처리됐어요!':'↩ 완료가 취소됐어요');
    fetch(`/api/todos/${id}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({completed:t?.completed}) }).catch(console.error);
  };
  const deleteTodo = (id: string) => {
    const ns = { ...appState };
    ns.todos = ns.todos.filter(t => t.id!==id);
    saveAppState(ns);
    fetch(`/api/todos/${id}`, { method:'DELETE' }).catch(console.error);
  };

  // ── Growth ───────────────────────────────────────────────────
  const saveGrowth = () => {
    if (!gDate) { showToast('날짜를 입력해주세요'); return; }
    const h = parseFloat(gHeight), w = parseFloat(gWeight);
    if (isNaN(h) && isNaN(w)) { showToast('키 또는 몸무게를 입력해주세요'); return; }
    const ns = { ...appState };
    const existing = ns.growth.find(r => r.date === gDate);
    if (existing) {
      if (!isNaN(h)) existing.height = h;
      if (!isNaN(w)) existing.weight = w;
    } else {
      ns.growth = [...ns.growth, { id: uid(), date: gDate, height: isNaN(h)?undefined:h, weight: isNaN(w)?undefined:w }];
    }
    saveAppState(ns);
    setShowGrowthForm(false); setGHeight(''); setGWeight('');
    showToast('📏 성장 기록이 저장됐어요!');
    const rec = ns.growth.find(r => r.date === gDate) || { id: uid(), date: gDate, height: isNaN(h)?undefined:h, weight: isNaN(w)?undefined:w };
    fetch('/api/growth', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ...rec, babyId: ns.babyId }) }).catch(console.error);
  };
  const deleteGrowth = (id: string) => {
    const ns = { ...appState, growth: appState.growth.filter(r => r.id !== id) };
    saveAppState(ns);
    fetch(`/api/growth/${id}`, { method:'DELETE' }).catch(console.error);
  };

  // ── Development ──────────────────────────────────────────────
  const toggleMilestone = (id: string) => {
    const ns = { ...appState };
    ns.development = { ...ns.development, [id]: !ns.development[id] };
    saveAppState(ns); showToast(ns.development[id]?'✓ 발달 항목을 완료했어요!':'↩ 발달 항목이 취소됐어요');
    fetch(`/api/developments/${id}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ completed: ns.development[id], babyId: ns.babyId }) }).catch(console.error);
  };

  // ── Setup ────────────────────────────────────────────────────
  const handleLogout = () => {
    localStorage.clear();
    setAppState(prev => ({ ...prev, babyId: null, baby: null }));
    if (setupNameRef.current) setupNameRef.current.value = '';
    if (setupBirthRef.current) setupBirthRef.current.value = '';
    setSetupGender('girl');
    setModal('setup');
    showToast('로그아웃 됐어요.');
  };

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = setupNameRef.current?.value.trim() || '';
    const birth = setupBirthRef.current?.value || '';
    if (!name) { showToast('아기 이름을 입력해주세요'); return; }
    if (!birth) { showToast('생년월일을 입력해주세요'); return; }
    if (birth > todayStr()) { showToast('생년월일이 오늘보다 미래일 수 없어요'); return; }
    const newBaby = { name, birthDate: birth, gender: setupGender };
    const babyRes = await fetch('/api/baby', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(newBaby) }).then(r => r.json()).catch(() => null);
    const babyId: number | null = babyRes?.id ?? null;
    // 해당 아기의 전체 상태를 서버에서 불러와 복원
    const url = babyId ? `/api/state?babyId=${babyId}` : '/api/state';
    const data = await fetch(url).then(r => r.ok ? r.json() : null).catch(() => null);
    const ns = Object.assign(defaultState(), data || { babyId, baby: newBaby });
    const AUTO_SCHED: { m: number; text: string; category: 'vaccine' | 'feeding' | 'other' }[] = [
      // 예방접종
      { m:0,  text:'BCG 접종 (출생 후 4주 이내)',            category:'vaccine' },
      { m:0,  text:'B형간염 1차 접종 (출생)',                category:'vaccine' },
      { m:1,  text:'B형간염 2차 접종 (1개월)',               category:'vaccine' },
      { m:2,  text:'DTaP·Hib·PCV·폴리오 1차 접종 (2개월)',  category:'vaccine' },
      { m:2,  text:'로타바이러스 1차 접종 (2개월)',           category:'vaccine' },
      { m:4,  text:'DTaP·Hib·PCV·폴리오 2차 접종 (4개월)',  category:'vaccine' },
      { m:4,  text:'로타바이러스 2차 접종 (4개월)',           category:'vaccine' },
      { m:6,  text:'DTaP·Hib·PCV·B형간염 3차 접종 (6개월)', category:'vaccine' },
      { m:6,  text:'로타바이러스 3차 접종 (6개월)',           category:'vaccine' },
      { m:12, text:'MMR·수두 접종 (12개월)',                 category:'vaccine' },
      { m:12, text:'A형간염 1차 접종 (12개월)',               category:'vaccine' },
      { m:15, text:'DTaP 4차 접종 (15개월)',                 category:'vaccine' },
      { m:18, text:'A형간염 2차 접종 (18개월)',               category:'vaccine' },
      // 영유아 검진
      { m:2,  text:'영유아 검진 1차 (2개월)',                 category:'other' },
      { m:4,  text:'영유아 검진 2차 (4개월)',                 category:'other' },
      { m:9,  text:'영유아 검진 3차 (9개월)',                 category:'other' },
      { m:18, text:'영유아 검진 4차 (18개월)',                category:'other' },
      { m:30, text:'영유아 검진 5차 (30개월)',                category:'other' },
      { m:42, text:'영유아 검진 6차 (42개월)',                category:'other' },
      // 이유식·수유
      { m:6,  text:'이유식 시작 (6개월)',                     category:'feeding' },
      { m:7,  text:'빨대컵 연습 시작 (7개월)',                category:'feeding' },
      { m:9,  text:'중기 이유식 전환 (9개월)',                category:'feeding' },
      { m:11, text:'후기 이유식 전환 (11개월)',               category:'feeding' },
      { m:12, text:'분유 → 생우유 전환 시작 (12개월)',        category:'feeding' },
    ];

    // 아기 현재 월령 계산
    const birthDt = new Date(newBaby.birthDate);
    const nowDt = new Date();
    const babyAgeMonths = (nowDt.getFullYear() - birthDt.getFullYear()) * 12
      + (nowDt.getMonth() - birthDt.getMonth());

    const addMonths = (d: string, m: number) => {
      const dt = new Date(d); dt.setMonth(dt.getMonth() + m);
      return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
    };

    const existingTexts = new Set(ns.todos.map((t: {text:string}) => t.text));

    // 현재 개월 이후 항목만 시드 (앞으로 18개월 이내)
    const newItems = AUTO_SCHED
      .filter(s => s.m > babyAgeMonths && s.m <= babyAgeMonths + 18)
      .filter(s => !existingTexts.has(s.text))
      .map(s => ({
        id: uid(), text: s.text, category: s.category,
        completed: false as const, createdAt: Date.now(),
        date: addMonths(newBaby.birthDate, s.m),
      }));

    if (newItems.length > 0) {
      ns.todos = [...ns.todos, ...newItems].sort((a, b) => (a.date||'').localeCompare(b.date||''));
      for (const todo of newItems) {
        await fetch('/api/todos', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ ...todo, babyId }) }).catch(console.error);
      }
    }
    if (babyId) localStorage.setItem('baby_id', String(babyId));
    saveAppState(ns); setModal(null);
    showToast(`👶 ${name}${koreanParticle(name,'이의','의')} 기록을 시작해요!`);
  };

  // ── Chat ─────────────────────────────────────────────────────
  const sendChat = async (text: string) => {
    if (!text.trim()) return;
    setChatInput('');
    const months = appState.baby ? getAgeInfo(appState.baby.birthDate).months : null;
    const name = appState.baby?.name || '아기';
    setChatMessages(prev => [...prev,
      { id: uid(), role: 'user', html: escHtml(text) },
      { id: 'typing', role: 'bot', html: '', isTyping: true },
    ]);
    try {
      const { chunks, figures } = await searchRAG(text);
      const context = chunks.length
        ? chunks.map(c => { const p = c.metadata.page ? ` (p.${c.metadata.page})` : ''; return `[출처: ${c.metadata.source}${p}]\n${c.text}`; }).join('\n\n---\n\n')
        : '';
      const systemPrompt = `너는 영유아 육아 전문 챗봇이야.\n아기 이름: ${name}, 월령: ${months != null ? months + '개월' : '미입력'}.\n아래 참고 문서를 바탕으로 질문에 정확하고 실용적인 답변을 해줘.\n- 항상 한국어로 답변\n- 중요 키워드는 <strong>볼드</strong> 처리\n- 목록은 <ul><li> 형식\n- 의학적 결정은 반드시 소아청소년과 전문의 상담 권고 포함\n- 없는 정보를 지어내지 마\n\n[참고 문서]\n${context || '관련 문서 없음. 일반 육아 지식으로 답변.'}`;
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(userOpenAIKeyRef.current ? { 'x-openai-key': userOpenAIKeyRef.current } : {}) },
        body: JSON.stringify({ model: 'gpt-4o-mini', max_tokens: 800, temperature: 0.3, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: text }] }),
      });
      const data = await res.json();
      const html = (data.choices?.[0]?.message?.content || getBotResponse(text, months, name)) + renderSources(chunks, figures);
      setChatMessages(prev => [...prev.filter(m => m.id !== 'typing'), { id: uid(), role: 'bot', html }]);
    } catch {
      const months2 = appState.baby ? getAgeInfo(appState.baby.birthDate).months : null;
      setChatMessages(prev => [...prev.filter(m => m.id !== 'typing'), { id: uid(), role: 'bot', html: getBotResponse(text, months2, name) }]);
    }
  };

  // ── Calendar navigation ──────────────────────────────────────
  const prevCalMonth = () => {
    if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11); }
    else setCalMonth(m => m - 1);
  };
  const nextCalMonth = () => {
    if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0); }
    else setCalMonth(m => m + 1);
  };

  // ── Voice GPT intent routing ──────────────────────────────────
  const handleVoiceRecord = (args: { type: LogType; times?: string[]; time?: string; endTime?: string; amount?: number; feedType?: string; note?: string }) => {
    const dateKey = todayStr();
    const timeList = (args.times && args.times.length > 0) ? args.times : [args.time || nowHHMM()];
    const ns = { ...appState };
    if (!ns.logs[dateKey]) ns.logs[dateKey] = [];
    const newLogs: Log[] = timeList.map(t => {
      const log: Log = { id: uid(), type: args.type, date: dateKey, note: args.note || '' };
      if (args.type === 'sleep' || args.type === 'cry' || args.type === 'walk' || args.type === 'play' || args.type === 'bath') {
        log.startTime = t;
        if (args.endTime && timeList.length === 1) log.endTime = args.endTime;
      } else {
        log.time = t; log.startTime = t;
      }
      if (args.type === 'feed') { log.amount = args.amount || null; log.feedType = args.feedType || '모유'; }
      return log;
    });
    ns.logs[dateKey] = [...ns.logs[dateKey], ...newLogs].sort((a,b) => (a.startTime||a.time||'').localeCompare(b.startTime||b.time||''));
    saveAppState(ns);
    const count = newLogs.length;
    showToast(`🎤 ${TYPE_ICONS[args.type]} ${TYPE_LABELS[args.type]} ${count > 1 ? `${count}건` : ''} 기록 완료!`);
    navigate('timeline');
    newLogs.forEach(log => fetch('/api/logs', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ ...log, babyId: appState.babyId }) }).catch(console.error));
  };

  const handleVoiceSchedule = (args: { text: string; category: string; date?: string }) => {
    const validCats: TodoCat[] = ['vaccine','feeding','play','supplies','other'];
    const catRaw = args.category === 'formula' || args.category === 'solid' ? 'feeding' : args.category;
    const cat: TodoCat = validCats.includes(catRaw as TodoCat) ? catRaw as TodoCat : 'other';
    // LLM이 date를 직접 반환하면 우선 사용, 없으면 텍스트에서 파싱, 그것도 없으면 오늘
    const resolvedDate = (args.date && /^\d{4}-\d{2}-\d{2}$/.test(args.date))
      ? args.date
      : (parseNaturalDate(args.text) || todayStr());
    const isScheduled = resolvedDate !== todayStr();
    const newTodo: Todo = { id:uid(), text:args.text, category:cat, completed:false, createdAt:Date.now(), date:resolvedDate };
    const ns = { ...appState };
    ns.todos = [newTodo, ...ns.todos];
    saveAppState(ns);
    const [,dm,dd] = resolvedDate.split('-').map(Number);
    showToast(isScheduled ? `🎤 ${dm}/${dd}에 추가됐어요: ${args.text}` : `🎤 스케줄에 추가됐어요: ${args.text}`);
    navigate('schedule');
    fetch('/api/todos', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ ...newTodo, babyId: appState.babyId }) }).catch(console.error);
  };

  const processVoiceInput = async (transcript: string) => {
    const closeOverlay = () => { setVoiceOverlay(false); setIsRecording(false); setVoiceProcessing(false); };
    try {
      setVoiceProcessing(true);
      setVoiceTranscript(`"${transcript}"`);
      const babyMonths = appState.baby ? getAgeInfo(appState.baby.birthDate).months : 5;
      const babyName = appState.baby?.name || '아기';
      const { todayDate, todayDow, nextMonday, nextMonth1st } = buildDateContext();
      const nowTime = nowHHMM();
      const ago30 = (() => { const [h,m]=nowTime.split(':').map(Number); const t=(h*60+m-30+1440)%1440; return `${String(Math.floor(t/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`; })();
      const ago20 = (() => { const [h,m]=nowTime.split(':').map(Number); const t=(h*60+m-20+1440)%1440; return `${String(Math.floor(t/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`; })();
      const tomorrow = (() => { const d=new Date(); d.setDate(d.getDate()+1); return localDateStr(d); })();
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(userOpenAIKeyRef.current ? { 'x-openai-key': userOpenAIKeyRef.current } : {}) },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: `너는 아기 육아 앱의 음성 명령 분류기야.
아기 이름: ${babyName}, 월령: ${babyMonths}개월
현재 시각: ${nowTime} / 오늘: ${todayDate}(${todayDow}요일) / 다음주 월요일: ${nextMonday} / 다음달 1일: ${nextMonth1st}

## 분류 우선순위
1. 키/몸무게/체온 수치 언급 → record_measurement
2. "자고 있어/잠들었어/재웠어/낮잠 자" → track_sleep(action=start)
3. "깼어/일어났어/기상했어" → track_sleep(action=end)
4. "지금 분유/모유 주고 있어/시작해/물리고 있어" → track_feed(action=start)
5. "다 먹었어/Xml 남겼어/조금 남겼어" → track_feed(action=end)
6. 미래 의도 ("살 거야", "예약해야", "맞혀야 해", "사야 해") → save_schedule
7. "${babyName}"/"아기"/"아가" 주어 + 현재/과거 활동 서술 → record_activity
8. 질문("~일까?","~야?","~해?","어떻게","얼마나","뭐야") 또는 정보 요청 → chat_response

## record_activity 활동 매핑
- 젖/모유/젖 물다/젖 먹다 → feed, feedType=모유
- 분유/분유 먹다/분유 줬어/분유 타다 → feed, feedType=분유
- 유축/유축모유 → feed, feedType=유축모유
- 이유식 → feed, feedType=이유식
- 쉬/오줌/소변/기저귀(소변 맥락) → pee
- 똥/대변/응가/기저귀(대변 맥락) → poop
- 울다/보채다/칭얼 → cry
- 산책/나갔다왔어 → walk
- 놀다/놀았다/터미타임/터미/놀이 → play
- 목욕/씻겼어 → bath

## 시간 변환 (HH:MM 24시간제, 현재=${nowTime})
- "방금/지금" → ${nowTime}
- "30분 전" → ${ago30} / "20분 전" → ${ago20} / "X분 전" → 현재에서 X분 빼기
- "2시" → "02:00", "오후 2시" → "14:00", "오전 10시" → "10:00"
- 여러 시간 → times 배열 (예: "2시 4시 6시" → ["02:00","04:00","06:00"])
- "X분 산책/놀이 다녀왔어/했어" → endTime=${nowTime}, time=현재-X분

## Few-shot 예시

[수유 — 이미 완료된 수유]
"${babyName} 방금 모유 10분 먹었어" → record_activity(type=feed, feedType=모유, time=${nowTime}, note="10분")
"${babyName} 2시 4시 6시에 분유 50ml 먹었어" → record_activity(type=feed, feedType=분유, times=["02:00","04:00","06:00"], amount=50)
"아기 오후 2시에 분유 150 줬어" → record_activity(type=feed, feedType=분유, time="14:00", amount=150)

[수유 — 진행 중 추적 (track_feed)]
"아기 지금 분유 150 주고 있어" → track_feed(action=start, feedType=분유, amount=150, time=${nowTime})
"아기 지금 모유 물리고 있어" → track_feed(action=start, feedType=모유, time=${nowTime})
"분유 30 밀리 남겼어" → track_feed(action=end, amount=30)
"아기 다 먹었어" → track_feed(action=end, amount=0)

[기저귀]
"${babyName} 방금 똥쌌어" → record_activity(type=poop, time=${nowTime})
"아기 30분 전에 소변 기저귀 갈았어" → record_activity(type=pee, time=${ago30})
"아기 응가했어" → record_activity(type=poop, time=${nowTime})

[수면]
"${babyName} 지금 자고 있어" → track_sleep(action=start, time=${nowTime})
"${babyName} 방금 깼어" → track_sleep(action=end, time=${nowTime})
"아기 20분 전에 잠들었어" → track_sleep(action=start, time=${ago20})

[산책/놀이]
"아기 방금 30분 산책 다녀왔어" → record_activity(type=walk, endTime=${nowTime}, time=${ago30})
"아기 지금 10분 터미타임 했어" → record_activity(type=play, note="터미타임", endTime=${nowTime}, time=${ago20})
"아기 오후 2시부터 3시까지 산책했어" → record_activity(type=walk, time="14:00", endTime="15:00")

[측정]
"아기 오늘 몸무게 3.2kg이야" → record_measurement(metric=weight, value=3.2)
"아기 키 58cm" → record_measurement(metric=height, value=58)
"체온 37.5도야" → record_measurement(metric=temp, value=37.5)

[스케줄]
"다음주에 기저귀 살거야" → save_schedule(text="기저귀 구매", category=other, date="${nextMonday}")
"다음주에 이유식 물품 살거야" → save_schedule(text="이유식 물품 구매", category=solid, date="${nextMonday}")
"다음달에 예방접종 맞혀야 해" → save_schedule(text="예방접종", category=vaccine, date="${nextMonth1st}")
"내일 소아과 가야 해" → save_schedule(text="소아과 방문", category=other, date="${tomorrow}")

[챗봇]
"분유 얼마나 먹여야 해?" → chat_response
"아기 건강 체온은 몇 도야?" → chat_response

## save_schedule category 기준
- vaccine: 예방접종·백신 명확히 언급된 경우만
- formula: 분유 구매/관련
- solid: 이유식 구매/관련
- other: 병원·쇼핑·구매·기타 모든 것 (애매하면 반드시 other)

## 오분류 주의
- "기저귀 사야 해/살 거야" → save_schedule(category=other), poop/pee 아님
- "똥 기저귀 다 떨어졌어" → save_schedule(category=other), poop 아님
- "분유 얼마나 먹여?" → chat_response (질문), feed 기록 아님
- "잠을 너무 못 자요" → chat_response (상담), track_sleep 아님`,
            },
            { role: 'user', content: transcript },
          ],
          tools: VOICE_TOOLS,
          tool_choice: 'required',
        }),
      });
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();
      const tcall = data.choices?.[0]?.message?.tool_calls?.[0];
      if (!tcall) throw new Error('no tool_call');
      const fn = tcall.function.name;
      const args = JSON.parse(tcall.function.arguments);
      closeOverlay();
      if (fn === 'record_activity') {
        handleVoiceRecord(args as Parameters<typeof handleVoiceRecord>[0]);
      } else if (fn === 'save_schedule') {
        handleVoiceSchedule(args as { text: string; category: string });
      } else if (fn === 'record_measurement') {
        const { metric, value, time } = args as { metric:'height'|'weight'|'temp'; value:number; time?:string };
        const t = time || nowHHMM();
        const dateKey = todayStr();
        const ns = { ...appState };
        if (metric === 'height' || metric === 'weight') {
          const existing = ns.growth.find(r => r.date === dateKey);
          if (existing) { existing[metric] = value; }
          else ns.growth = [...ns.growth, { id:uid(), date:dateKey, [metric]:value }];
          const label = metric === 'height' ? `키 ${value}cm` : `몸무게 ${value}kg`;
          const log: Log = { id:uid(), type:'measure', date:dateKey, note:label, time:t, startTime:t };
          if (!ns.logs[dateKey]) ns.logs[dateKey] = [];
          ns.logs[dateKey] = [...ns.logs[dateKey], log].sort((a,b)=>(a.startTime||a.time||'').localeCompare(b.startTime||b.time||''));
          saveAppState(ns);
          showToast(`📏 ${label} 기록 완료!`);
          navigate('timeline');
          fetch('/api/growth', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ ...ns.growth.find(r=>r.date===dateKey), babyId:ns.babyId }) }).catch(console.error);
          fetch('/api/logs', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ ...log, babyId:ns.babyId }) }).catch(console.error);
        } else {
          const healthLog: HealthLog = { id:uid(), type:'temp', detail:`${value}°C`, date:dateKey, time:t };
          ns.health = { ...ns.health, logs:[...ns.health.logs, healthLog] };
          const log: Log = { id:uid(), type:'measure', date:dateKey, note:`체온 ${value}°C`, time:t, startTime:t };
          if (!ns.logs[dateKey]) ns.logs[dateKey] = [];
          ns.logs[dateKey] = [...ns.logs[dateKey], log].sort((a,b)=>(a.startTime||a.time||'').localeCompare(b.startTime||b.time||''));
          saveAppState(ns);
          showToast(`🌡️ 체온 ${value}°C 기록 완료!`);
          navigate('timeline');
          fetch('/api/logs', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ ...log, babyId:ns.babyId }) }).catch(console.error);
        }
      } else if (fn === 'track_sleep') {
        const { action, time } = args as { action: 'start' | 'end'; time?: string };
        const t = time || nowHHMM();
        const dateKey = todayStr();
        if (action === 'start') {
          // 시작 시각만 기록, logId 저장
          const logId = uid();
          const log: Log = { id: logId, type: 'sleep', date: dateKey, note: '', startTime: t };
          const ns = { ...appState };
          if (!ns.logs[dateKey]) ns.logs[dateKey] = [];
          ns.logs[dateKey] = [...ns.logs[dateKey], log].sort((a,b) => (a.startTime||'').localeCompare(b.startTime||''));
          saveAppState(ns);
          setVoiceSleepStart({ logId, time: t });
          showToast(`😴 ${t} 수면 시작 기록. "아기 깼어"로 종료하세요`);
          navigate('timeline');
          fetch('/api/logs', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ ...log, babyId: appState.babyId }) }).catch(console.error);
        } else {
          // 저장된 시작 로그에 endTime 추가
          if (voiceSleepStart) {
            const ns = { ...appState };
            if (ns.logs[dateKey]) {
              ns.logs[dateKey] = ns.logs[dateKey].map(l =>
                l.id === voiceSleepStart.logId ? { ...l, endTime: t } : l
              );
            }
            saveAppState(ns);
            setVoiceSleepStart(null);
            showToast(`😴 수면 종료: ${voiceSleepStart.time} ~ ${t}`);
            navigate('timeline');
            fetch(`/api/logs/${voiceSleepStart.logId}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ endTime: t }) }).catch(console.error);
          } else {
            showToast('수면 시작 기록이 없어요. "아기 자고 있어"를 먼저 말해주세요');
          }
        }
      } else if (fn === 'track_feed') {
        const { action, feedType, amount, time } = args as { action:'start'|'end'; feedType?:string; amount?:number; time?:string };
        const t = time || nowHHMM();
        const dateKey = todayStr();
        if (action === 'start') {
          // 즉시 기록 (A방식) + voiceFeedStart 상태 저장
          const logId = uid();
          const givenAmount = amount || 0;
          const ft = feedType || '분유';
          const log: Log = { id:logId, type:'feed', date:dateKey, time:t, startTime:t, feedType:ft, amount:givenAmount || null, note:'수유중' };
          const ns = { ...appState };
          if (!ns.logs[dateKey]) ns.logs[dateKey] = [];
          ns.logs[dateKey] = [...ns.logs[dateKey], log].sort((a,b) => (a.startTime||a.time||'').localeCompare(b.startTime||b.time||''));
          saveAppState(ns);
          setVoiceFeedStart({ logId, time:t, amount:givenAmount, feedType:ft });
          const amountStr = givenAmount ? ` ${givenAmount}ml` : '';
          showToast(`🍼 ${ft}${amountStr} 수유 시작. 완료되면 "다 먹었어" 또는 "Xml 남겼어"라고 말해주세요`);
          navigate('timeline');
          fetch('/api/logs', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ ...log, babyId:appState.babyId }) }).catch(console.error);
        } else {
          // 남긴 양 기반으로 실제 섭취량 계산 후 기존 로그 업데이트
          if (voiceFeedStart) {
            const remaining = amount ?? 0;
            const consumed = voiceFeedStart.amount > 0
              ? Math.max(0, voiceFeedStart.amount - remaining)
              : null;
            const ns = { ...appState };
            if (ns.logs[dateKey]) {
              ns.logs[dateKey] = ns.logs[dateKey].map(l =>
                l.id === voiceFeedStart.logId
                  ? { ...l, amount: consumed, note: remaining > 0 ? `${remaining}ml 남김` : '' }
                  : l
              );
            }
            saveAppState(ns);
            setVoiceFeedStart(null);
            const msg = consumed !== null
              ? `🍼 수유 완료: ${consumed}ml 섭취${remaining > 0 ? ` (${remaining}ml 남김)` : ''}`
              : `🍼 수유 완료`;
            showToast(msg);
            navigate('timeline');
            fetch(`/api/logs/${voiceFeedStart.logId}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ amount:consumed, note:remaining > 0 ? `${remaining}ml 남김` : '' }) }).catch(console.error);
          } else {
            // 시작 기록 없이 완료 발화 → 일반 수유 기록으로 처리
            const consumed = amount || null;
            const ft = feedType || '분유';
            const log: Log = { id:uid(), type:'feed', date:dateKey, time:t, startTime:t, feedType:ft, amount:consumed, note:'' };
            const ns = { ...appState };
            if (!ns.logs[dateKey]) ns.logs[dateKey] = [];
            ns.logs[dateKey] = [...ns.logs[dateKey], log].sort((a,b) => (a.startTime||a.time||'').localeCompare(b.startTime||b.time||''));
            saveAppState(ns);
            showToast(`🍼 ${ft} 수유 기록 완료${consumed ? ` (${consumed}ml)` : ''}`);
            navigate('timeline');
            fetch('/api/logs', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ ...log, babyId:appState.babyId }) }).catch(console.error);
          }
        }
      } else {
        navigate('chat');
        setTimeout(() => sendChat(transcript), 200);
      }
    } catch (err) {
      console.error('[voice router]', err);
      closeOverlay();
      navigate('chat');
      setTimeout(() => sendChat(transcript), 200);
      showToast('💬 챗봇으로 연결했어요');
    }
  };

  // ── Computed ─────────────────────────────────────────────────
  const ageInfo = appState.baby ? getAgeInfo(appState.baby.birthDate) : null;
  const todayLogs = appState.logs[todayStr()] || [];
  const sleepMin = todayLogs.filter(l=>l.type==='sleep'&&l.endTime).reduce((acc,l)=>{
    let d=hmToMin(l.endTime!)-hmToMin(l.startTime!); if(d<0) d+=1440; return acc+d;
  }, 0);
  const isNightSleep = (t?: string) => !!t && (t >= '20:00' || t < '08:00');
  const calcSleepMin = (logs: typeof todayLogs) => logs.filter(l=>l.type==='sleep'&&l.endTime).reduce((acc,l)=>{
    let d=hmToMin(l.endTime!)-hmToMin(l.startTime!); if(d<0) d+=1440; return acc+d;
  }, 0);
  const nightSleepMin = calcSleepMin(todayLogs.filter(l=>isNightSleep(l.startTime)));
  const napSleepMin   = calcSleepMin(todayLogs.filter(l=>!isNightSleep(l.startTime)));
  const feedCount = todayLogs.filter(l=>l.type==='feed').length;
  const breastCount = todayLogs.filter(l=>l.type==='feed'&&l.feedType==='모유').length;
  const formulaCount = todayLogs.filter(l=>l.type==='feed'&&l.feedType!=='모유').length;
  const breastMl = todayLogs.filter(l=>l.type==='feed'&&l.feedType==='모유').reduce((s,l)=>s+(l.amount||0),0);
  const formulaMl = todayLogs.filter(l=>l.type==='feed'&&l.feedType!=='모유').reduce((s,l)=>s+(l.amount||0),0);
  const peeCount   = todayLogs.filter(l=>l.type==='pee').length;
  const poopCount  = todayLogs.filter(l=>l.type==='poop').length;
  const diaperCount = peeCount + poopCount;
  const latestHeight = [...appState.growth].filter(r=>r.height!=null).sort((a,b)=>b.date.localeCompare(a.date))[0]?.height;
  const latestWeight = [...appState.growth].filter(r=>r.weight!=null).sort((a,b)=>b.date.localeCompare(a.date))[0]?.weight;
  const fmtSleepTime = (m: number) => m === 0 ? '—' : m >= 60 ? `${Math.floor(m/60)}h${m%60>0?` ${m%60}m`:''}` : `${m}m`;
  const walkCount = todayLogs.filter(l=>l.type==='walk').length;

  const recentLogs = (() => {
    const all: (Log & {dateKey:string})[] = [];
    for(let i=0;i<3;i++){
      const dk=shiftDate(todayStr(),-i);
      (appState.logs[dk]||[]).forEach(l=>all.push({...l,dateKey:dk}));
    }
    return all.sort((a,b)=>{
      const ta=a.dateKey+' '+(a.startTime||a.time||'00:00');
      const tb=b.dateKey+' '+(b.startTime||b.time||'00:00');
      return tb.localeCompare(ta);
    }).slice(0,6);
  })();

  const alerts = (() => {
    const list: {icon:string;text:string}[] = [];
    if(ageInfo) {
      const {months} = ageInfo;
      [{at:0,msg:'출생 시 BCG, B형간염 1차 접종이 필요해요'},{at:1,msg:'B형간염 2차 접종 시기예요'},{at:2,msg:'DTaP·폴리오·Hib·폐렴구균·로타 1차 접종 시기예요'},{at:4,msg:'DTaP·폴리오·Hib·폐렴구균·로타 2차 접종 시기예요'},{at:6,msg:'DTaP·폴리오·B형간염 3차 접종 시기예요'},{at:12,msg:'MMR·수두·Hib·폐렴구균 4차 접종 시기예요'},{at:15,msg:'DTaP 4차 접종 시기예요'},{at:18,msg:'A형간염 1차 접종 시기예요'}]
        .filter(s=>s.at===months).forEach(s=>list.push({icon:'💉',text:s.msg}));
      const fc = [{at:1,msg:'분유량 90~120ml, 하루 6~7회로 늘려주세요'},{at:2,msg:'분유량 120~150ml로 늘려주세요'},{at:3,msg:'분유량 150~180ml로 늘려주세요'},{at:4,msg:'분유량 150~210ml, 하루 4~5회로 조절해요'},{at:6,msg:'이유식 시작과 함께 분유량을 서서히 줄여요'}].find(c=>c.at===months);
      if(fc) list.push({icon:'🍼',text:fc.msg});
      if(months>=5&&months<=7) list.push({icon:'🥣',text:'이유식 시작 시기입니다! 챗봇에서 자세한 정보를 확인하세요.'});
    }
    return list;
  })();

  const today = todayStr();
  const oneMonthLater = (() => { const d = new Date(); d.setDate(d.getDate() + 35); return localDateStr(d); })();
  const filteredTodos = (todoFilter==='all'?appState.todos:appState.todos.filter(t=>t.category===todoFilter))
    .filter(t => !t.date || (t.date >= today && t.date <= oneMonthLater));
  const sortedTodos = [...filteredTodos].sort((a,b)=>{
    if(a.completed!==b.completed) return a.completed?1:-1;
    if(!a.completed) {
      if(a.date&&b.date) return a.date.localeCompare(b.date);
      if(a.date) return -1; if(b.date) return 1;
    }
    return b.createdAt-a.createdAt;
  });

  const timelineLogs = appState.logs[timelineDate] || [];

  // ── Timeline overlap layout ───────────────────────────────────
  const timelineLayout = (() => {
    type Block = { log: Log; top: number; height: number; bottom: number; col: number; totalCols: number; };
    const blocks: Block[] = timelineLogs.map(log => {
      const startMin = hmToMin(log.startTime || log.time || '00:00');
      const endMin = log.endTime ? hmToMin(log.endTime) : null;
      let height = 28;
      if (endMin !== null) { let dur = endMin - startMin; if (dur <= 0) dur += 1440; height = Math.max(dur, 24); }
      return { log, top: startMin, height, bottom: startMin + height, col: 0, totalCols: 1 };
    });

    // Assign columns: smallest available not used by already-placed overlapping blocks
    for (let i = 0; i < blocks.length; i++) {
      const used = new Set<number>();
      for (let j = 0; j < i; j++) {
        if (blocks[j].bottom > blocks[i].top && blocks[j].top < blocks[i].bottom) used.add(blocks[j].col);
      }
      let col = 0; while (used.has(col)) col++;
      blocks[i].col = col;
    }

    // Compute max columns needed for each overlap group
    for (let i = 0; i < blocks.length; i++) {
      const group = blocks.filter(b => b.bottom > blocks[i].top && b.top < blocks[i].bottom);
      const maxCol = Math.max(...group.map(b => b.col)) + 1;
      group.forEach(b => { b.totalCols = Math.max(b.totalCols, maxCol); });
    }
    return blocks;
  })();

  // ── Hour axis for timeline ────────────────────────────────────
  const hourLabels = Array.from({length:24},(_,h)=>({h, label: h===0?'자정':h<12?`${h}시`:h===12?'정오':`${h}시`}));
  const nowMin = new Date().getHours()*60+new Date().getMinutes();

  if (!mounted) return null;

  // ── Render ───────────────────────────────────────────────────
  return (
    <div id="app" suppressHydrationWarning>
      {/* Toast */}
      <div className={`toast${toastVisible?' show':''}`}>{toast}</div>

      {/* Setup Modal */}
      <div className={`modal-overlay${modal==='setup'?' active':''}`} role="dialog" aria-modal="true">
        <div className="modal-card setup-modal-card">
          {appState.baby && (
            <div className="modal-header">
              <span />
              <button className="modal-close" onClick={()=>setModal(null)} aria-label="닫기">✕</button>
            </div>
          )}
          <div className="setup-hero">
            <div className="setup-photo-wrap">
              <div className="setup-photo-circle" onClick={() => photoInputRef.current?.click()}>
                {babyPhoto
                  ? <img src={babyPhoto} alt="아기 사진" className="setup-photo-img" />
                  : <span className="setup-photo-emoji">{setupGender==='boy'?'👦':'👧'}</span>
                }
                <div className="setup-photo-overlay">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
                    <circle cx="12" cy="13" r="4"/>
                  </svg>
                </div>
              </div>
              <input ref={photoInputRef} type="file" accept="image/*" style={{display:'none'}} onChange={handlePhotoChange} />
              {babyPhoto && (
                <button type="button" className="setup-photo-remove" onClick={()=>{ setBabyPhoto(null); localStorage.removeItem('baby_photo'); }}>사진 삭제</button>
              )}
            </div>
            {!appState.baby && <p style={{fontSize:'13px',color:'var(--text-mid)',marginTop:'8px'}}>아기 정보를 입력하고 맞춤 정보를 받아보세요</p>}
          </div>
          <form className="setup-form" onSubmit={handleSetup} noValidate>
            <div className="form-group">
              <label htmlFor="baby-name-input">아기 이름</label>
              <input ref={setupNameRef} type="text" id="baby-name-input" placeholder="예: 지우, 민준" maxLength={20} autoComplete="off" defaultValue={appState.baby?.name || ''} />
            </div>
            <div className="form-group">
              <label htmlFor="baby-birth-input">생년월일</label>
              <input ref={setupBirthRef} type="date" id="baby-birth-input" defaultValue={appState.baby?.birthDate || ''} />
            </div>
            <div className="form-group">
              <label>성별</label>
              <div className="gender-buttons">
                <button type="button" className={`gender-btn${setupGender==='girl'?' active':''}`} onClick={()=>setSetupGender('girl')}>👧 여아</button>
                <button type="button" className={`gender-btn${setupGender==='boy'?' active':''}`} onClick={()=>setSetupGender('boy')}>👦 남아</button>
              </div>
            </div>
            {appState.baby ? (
              <button type="button" className="btn-danger btn-full" onClick={handleLogout}>로그아웃</button>
            ) : (
              <button type="submit" className="btn-primary btn-full">시작하기 ✨</button>
            )}
          </form>
        </div>
      </div>

      {/* Add Log Modal */}
      <div className={`modal-overlay${modal==='addLog'?' active':''}`} role="dialog" aria-modal="true">
        <div className="modal-card">
          <div className="modal-header">
            <h3>{editingLogId ? '기록 수정' : '기록 추가'}</h3>
            <button className="modal-close" onClick={()=>{setEditingLogId(null);setModal(null);}} aria-label="닫기">✕</button>
          </div>
          <div className="log-type-tabs" role="tablist">
            {(['sleep','feed','pee','poop','cry','walk','play','bath','measure','other'] as LogType[]).map(type=>(
              <button key={type} className={`type-tab${addLogType===type?' active':''}`} role="tab"
                onClick={()=>{setAddLogType(type); const now=nowHHMM(),end=minToHM((hmToMin(now)+60)%1440); setLfStart(now);setLfEnd(end);setLfTime(now);setLfNote('');setLfAmount('');setLfFeedType('분유');setLfReason('');setLfColor('노란색');}}>
                {TYPE_ICONS[type]} {TYPE_LABELS[type]}
              </button>
            ))}
          </div>
          <div className="log-form-content">
            {(addLogType==='sleep'||addLogType==='cry'||addLogType==='walk'||addLogType==='play'||addLogType==='bath') && (
              <div className="time-row">
                <div className="form-group"><label>시작 시간</label><input type="time" value={lfStart} onChange={e=>setLfStart(e.target.value)} /></div>
                <div className="form-group"><label>종료 시간</label><input type="time" value={lfEnd} onChange={e=>setLfEnd(e.target.value)} /></div>
              </div>
            )}
            {(addLogType==='feed'||addLogType==='pee'||addLogType==='poop') && (
              <div className="form-group"><label>{addLogType==='feed'?'수유 시간':'시간'}</label><input type="time" value={lfTime} onChange={e=>setLfTime(e.target.value)} /></div>
            )}
            {addLogType==='feed' && (
              <>
                <div className="form-group"><label>수유량 (ml)</label><input type="number" value={lfAmount} onChange={e=>setLfAmount(e.target.value)} placeholder="예: 120" min="0" max="500" /></div>
                <div className="form-group">
                  <label>수유 방법</label>
                  <select value={lfFeedType} onChange={e=>setLfFeedType(e.target.value)}>
                    <option value="분유">🍼 분유</option><option value="모유">🤱 모유</option><option value="유축모유">🍶 유축모유</option><option value="혼합">💛 혼합</option><option value="우유">🥛 우유</option><option value="이유식">🥣 이유식</option>
                  </select>
                </div>
              </>
            )}
            {addLogType==='poop' && (
              <div className="form-group">
                <label>색상</label>
                <select value={lfColor} onChange={e=>setLfColor(e.target.value)}>
                  <option value="노란색">노란색 (정상)</option><option value="황록색">황록색</option><option value="갈색">갈색</option>
                  <option value="검은색">검은색 (주의)</option><option value="붉은색">붉은색 (주의)</option><option value="흰색">흰색 (주의)</option>
                </select>
              </div>
            )}
            {addLogType==='cry' && (
              <div className="form-group">
                <label>원인 (추정)</label>
                <select value={lfReason} onChange={e=>setLfReason(e.target.value)}>
                  <option value="">알 수 없음</option><option value="배고픔">배고픔</option><option value="기저귀">기저귀</option>
                  <option value="졸림">졸림</option><option value="배앓이">배앓이</option><option value="안아달라">안아달라</option>
                </select>
              </div>
            )}
            {addLogType==='measure' && (
              <>
                <div className="form-group"><label>시간</label><input type="time" value={lfTime} onChange={e=>setLfTime(e.target.value)} /></div>
                <div className="time-row">
                  <div className="form-group"><label>키 (cm)</label><input type="number" value={lfHeight} onChange={e=>setLfHeight(e.target.value)} placeholder="예: 60.5" min="30" max="130" step="0.1" /></div>
                  <div className="form-group"><label>몸무게 (kg)</label><input type="number" value={lfWeight} onChange={e=>setLfWeight(e.target.value)} placeholder="예: 5.2" min="1" max="30" step="0.01" /></div>
                </div>
              </>
            )}
            {addLogType==='other' && (
              <div className="form-group"><label>시간</label><input type="time" value={lfTime} onChange={e=>setLfTime(e.target.value)} /></div>
            )}
            <div className="form-group">
              <label>{addLogType==='other' ? '내용 (필수)' : '메모'}</label>
              <div style={{position:'relative'}}>
                <textarea value={lfNote} onChange={e=>setLfNote(e.target.value)} placeholder={addLogType==='other'?'기록할 내용을 입력하세요':'특이사항을 입력하세요'} style={{paddingRight:'2.8rem'}} />
                <button type="button" onClick={startVoiceRecognition} title={isRecording?'음성 인식 중지':'음성으로 입력'} style={{position:'absolute',right:'0.5rem',bottom:'0.5rem',background:isRecording?'#ef4444':'#6366f1',color:'#fff',border:'none',borderRadius:'50%',width:'2rem',height:'2rem',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',fontSize:'1rem',flexShrink:0}}>
                  {isRecording ? '⏹' : '🎤'}
                </button>
              </div>
            </div>
            {editingLogId && (
              <button className="btn-secondary btn-full" style={{marginBottom:'8px'}} onClick={()=>{setEditingLogId(null);setModal('logDetail');}}>← 취소</button>
            )}
            <button className="btn-primary btn-full" onClick={saveLog}>
              {editingLogId ? `✏️ ${TYPE_LABELS[addLogType]} 수정 완료` : `${TYPE_ICONS[addLogType]} ${TYPE_LABELS[addLogType]} 기록 저장`}
            </button>
          </div>
        </div>
      </div>

      {/* Health Log Modal */}
      <div className={`modal-overlay${modal==='healthLog'?' active':''}`} role="dialog" aria-modal="true">
        <div className="modal-card">
          <div className="modal-header">
            <h3>{healthModalMode==='health'?'건강 기록 추가':'복약 정보 추가'}</h3>
            <button className="modal-close" onClick={()=>setModal(null)} aria-label="닫기">✕</button>
          </div>
          <div className="log-form-content">
            {healthModalMode==='health' && (
              <>
                <div className="form-group">
                  <label>기록 유형</label>
                  <select value={hfType} onChange={e=>setHfType(e.target.value as HealthLogType)}>
                    <option value="temp">🌡️ 체온</option><option value="rash">🔴 피부 발진</option>
                    <option value="symptom">😷 증상</option><option value="other">📝 기타</option>
                  </select>
                </div>
                <div className="form-group"><label>상세 내용</label><textarea value={hfDetail} onChange={e=>setHfDetail(e.target.value)} placeholder="예: 37.8℃, 좌측 뺨에 발진 등" rows={3} /></div>
                <div className="time-row">
                  <div className="form-group"><label>날짜</label><input type="date" value={hfDate} onChange={e=>setHfDate(e.target.value)} /></div>
                  <div className="form-group"><label>시간</label><input type="time" value={hfTime2} onChange={e=>setHfTime2(e.target.value)} /></div>
                </div>
                <button className="btn-primary btn-full" onClick={saveHealthLog}>저장</button>
              </>
            )}
            {healthModalMode==='medication' && (
              <>
                {/* OCR 촬영 버튼 */}
                <div style={{marginBottom:'12px'}}>
                  <label style={{display:'block',fontSize:'13px',fontWeight:600,marginBottom:'6px'}}>약 봉투 OCR 인식</label>
                  <label style={{
                    display:'flex',alignItems:'center',justifyContent:'center',gap:'8px',
                    padding:'10px',borderRadius:'12px',border:'2px dashed #6366f1',
                    cursor: isMedOcrLoading ? 'not-allowed' : 'pointer',
                    background:'#f5f3ff',color:'#6366f1',fontWeight:600,fontSize:'14px',
                    opacity: isMedOcrLoading ? 0.6 : 1,
                  }}>
                    <input type="file" accept="image/*" capture="environment" style={{display:'none'}}
                      disabled={isMedOcrLoading}
                      onChange={async e => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setIsMedOcrLoading(true);
                        try {
                          const base64 = await new Promise<string>((resolve, reject) => {
                            const reader = new FileReader();
                            reader.onload = () => resolve((reader.result as string).split(',')[1]);
                            reader.onerror = reject;
                            reader.readAsDataURL(file);
                          });
                          const res = await fetch('/api/ocr-medicine', {
                            method: 'POST',
                            headers: {
                              'Content-Type': 'application/json',
                              ...(userOpenAIKeyRef.current ? { 'x-openai-key': userOpenAIKeyRef.current } : {}),
                            },
                            body: JSON.stringify({ imageBase64: base64, mimeType: file.type }),
                          });
                          const data = await res.json();
                          if (data.error) { showToast('인식 실패: ' + data.error); return; }
                          if (data.name)  setHfMedname(data.name);
                          if (data.dose)  setHfDose(data.dose);
                          if (data.freq)  setHfFreq(data.freq);
                          if (data.note)  setHfMedNote(data.note);
                          showToast('📷 약 봉투 인식 완료! 내용을 확인해주세요.');
                        } catch {
                          showToast('이미지 처리 중 오류가 발생했어요.');
                        } finally {
                          setIsMedOcrLoading(false);
                          e.target.value = '';
                        }
                      }}
                    />
                    {isMedOcrLoading ? '📷 인식 중...' : '📷 약 봉투 촬영하기'}
                  </label>
                  <p style={{fontSize:'11px',color:'#999',margin:'4px 0 0',textAlign:'center'}}>촬영하면 약 이름·용량·횟수가 자동 입력돼요</p>
                </div>
                <div className="form-group"><label>약 이름</label><input type="text" value={hfMedname} onChange={e=>setHfMedname(e.target.value)} placeholder="예: 타이레놀 시럽, 훼스탈 등" /></div>
                <div className="time-row">
                  <div className="form-group"><label>1회 용량</label><input type="text" value={hfDose} onChange={e=>setHfDose(e.target.value)} placeholder="예: 5ml" /></div>
                  <div className="form-group"><label>복용 횟수</label><input type="text" value={hfFreq} onChange={e=>setHfFreq(e.target.value)} placeholder="예: 하루 3회" /></div>
                </div>
                <div className="form-group"><label>메모</label><textarea value={hfMedNote} onChange={e=>setHfMedNote(e.target.value)} placeholder="처방병원, 복약 목적 등" /></div>
                <div className="form-group"><label>처방일</label><input type="date" value={hfMedDate} onChange={e=>setHfMedDate(e.target.value)} /></div>
                <button className="btn-primary btn-full" onClick={saveMedication}>저장</button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Log Detail Modal */}
      <div className={`modal-overlay${modal==='logDetail'?' active':''}`} role="dialog" aria-modal="true">
        <div className="modal-card">
          <div className="modal-header">
            <h3>기록 상세</h3>
            <button className="modal-close" onClick={()=>setModal(null)} aria-label="닫기">✕</button>
          </div>
          {selectedLog && (
            <div className="log-detail-view">
              <div className="log-detail-hero">
                <span className="log-detail-hero-icon">{TYPE_ICONS[selectedLog.type]}</span>
                <div>
                  <div className="log-detail-hero-type">{TYPE_LABELS[selectedLog.type]}</div>
                  <div className="log-detail-hero-date">{fmtDisplayDate(selectedLog.dateKey)}</div>
                </div>
              </div>
              <div className="log-detail-rows">
                {(selectedLog.type==='sleep'||selectedLog.type==='cry'||selectedLog.type==='walk') && (
                  <>
                    <div className="log-detail-row">
                      <span className="log-detail-key">시간</span>
                      <span className="log-detail-val">{selectedLog.startTime||'—'}{selectedLog.endTime?` ~ ${selectedLog.endTime}`:''}</span>
                    </div>
                    {selectedLog.startTime && selectedLog.endTime && (
                      <div className="log-detail-row">
                        <span className="log-detail-key">소요 시간</span>
                        <span className="log-detail-val">{fmtDuration(selectedLog.startTime, selectedLog.endTime)}</span>
                      </div>
                    )}
                  </>
                )}
                {(selectedLog.type==='feed'||selectedLog.type==='pee'||selectedLog.type==='poop') && (
                  <div className="log-detail-row">
                    <span className="log-detail-key">시간</span>
                    <span className="log-detail-val">{selectedLog.time||selectedLog.startTime||'—'}</span>
                  </div>
                )}
                {selectedLog.type==='feed' && (<>
                  <div className="log-detail-row">
                    <span className="log-detail-key">수유량</span>
                    <span className="log-detail-val">{selectedLog.amount ? `${selectedLog.amount}ml` : '—'}</span>
                  </div>
                  <div className="log-detail-row">
                    <span className="log-detail-key">수유 방법</span>
                    <span className="log-detail-val">{selectedLog.feedType||'—'}</span>
                  </div>
                </>)}
                {selectedLog.type==='poop' && (
                  <div className="log-detail-row">
                    <span className="log-detail-key">색상</span>
                    <span className="log-detail-val">{selectedLog.color||'—'}</span>
                  </div>
                )}
                {selectedLog.type==='cry' && (
                  <div className="log-detail-row">
                    <span className="log-detail-key">원인</span>
                    <span className="log-detail-val">{selectedLog.reason||'알 수 없음'}</span>
                  </div>
                )}
                {selectedLog.note && (
                  <div className="log-detail-row">
                    <span className="log-detail-key">메모</span>
                    <span className="log-detail-val log-detail-note">{selectedLog.note}</span>
                  </div>
                )}
              </div>
              <div className="log-detail-actions">
                <button className="btn-secondary" style={{flex:1}} onClick={openEditLog}>✏️ 수정</button>
                <button className="btn-danger" style={{flex:1}} onClick={()=>deleteLog(selectedLog.dateKey, selectedLog.id)}>🗑️ 삭제</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Settings Modal */}
      <div className={`modal-overlay${modal==='settings'?' active':''}`} role="dialog" aria-modal="true">
        <div className="modal-card">
          <div className="modal-header">
            <h3>API 키 설정</h3>
            <button className="modal-close" onClick={()=>setModal(null)} aria-label="닫기">✕</button>
          </div>
          <div style={{padding:'16px',display:'flex',flexDirection:'column',gap:'20px'}}>
            <p style={{fontSize:'13px',color:'#666',margin:0,lineHeight:1.5}}>
              키를 입력하지 않으면 <strong>기본 키</strong>로 작동합니다.<br/>개인 키를 입력하면 해당 키를 우선 사용합니다.
            </p>

            <div style={{display:'flex',flexDirection:'column',gap:'8px'}}>
              <label style={{fontSize:'13px',fontWeight:600}}>
                OpenAI API Key <span style={{color:'#aaa',fontWeight:400}}>(챗봇)</span>
                {!userOpenAIKey && <span style={{marginLeft:'8px',fontSize:'11px',color:'#22c55e',fontWeight:600}}>✓ 기본 키 사용 중</span>}
              </label>
              <div style={{display:'flex',gap:'8px',alignItems:'center'}}>
                <input
                  type={showOpenAIKey ? 'text' : 'password'}
                  value={userOpenAIKey}
                  onChange={e => setUserOpenAIKey(e.target.value)}
                  placeholder="개인 키 입력 (선택사항)"
                  style={{flex:1,padding:'10px 12px',borderRadius:'10px',border:'1.5px solid #e0e0e0',fontSize:'13px',outline:'none'}}
                />
                <button onClick={()=>setShowOpenAIKey(v=>!v)} style={{background:'none',border:'none',cursor:'pointer',fontSize:'16px',padding:'4px'}}>{showOpenAIKey?'🙈':'👁️'}</button>
              </div>
              {userOpenAIKey && <button onClick={()=>{ setUserOpenAIKey(''); localStorage.removeItem('user_openai_key'); userOpenAIKeyRef.current=''; showToast('개인 키가 삭제됐어요. 기본 키로 작동합니다.'); }} style={{alignSelf:'flex-start',background:'none',border:'none',fontSize:'12px',color:'#ef4444',cursor:'pointer',padding:0}}>✕ 개인 키 삭제 (기본 키로 복원)</button>}
              <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" style={{fontSize:'12px',color:'#7c6ef7'}}>개인 키 발급받기 →</a>
            </div>

            <div style={{display:'flex',flexDirection:'column',gap:'8px'}}>
              <label style={{fontSize:'13px',fontWeight:600}}>
                YouTube Data API Key <span style={{color:'#aaa',fontWeight:400}}>(유튜브)</span>
                {!userYoutubeKey && <span style={{marginLeft:'8px',fontSize:'11px',color:'#22c55e',fontWeight:600}}>✓ 기본 키 사용 중</span>}
              </label>
              <div style={{display:'flex',gap:'8px',alignItems:'center'}}>
                <input
                  type={showYoutubeKey ? 'text' : 'password'}
                  value={userYoutubeKey}
                  onChange={e => setUserYoutubeKey(e.target.value)}
                  placeholder="개인 키 입력 (선택사항)"
                  style={{flex:1,padding:'10px 12px',borderRadius:'10px',border:'1.5px solid #e0e0e0',fontSize:'13px',outline:'none'}}
                />
                <button onClick={()=>setShowYoutubeKey(v=>!v)} style={{background:'none',border:'none',cursor:'pointer',fontSize:'16px',padding:'4px'}}>{showYoutubeKey?'🙈':'👁️'}</button>
              </div>
              {userYoutubeKey && <button onClick={()=>{ setUserYoutubeKey(''); localStorage.removeItem('user_youtube_key'); userYoutubeKeyRef.current=''; setYtRepVideos({}); setYtRefetchTrigger(t=>t+1); showToast('개인 키가 삭제됐어요. 기본 키로 작동합니다.'); }} style={{alignSelf:'flex-start',background:'none',border:'none',fontSize:'12px',color:'#ef4444',cursor:'pointer',padding:0}}>✕ 개인 키 삭제 (기본 키로 복원)</button>}
              <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" style={{fontSize:'12px',color:'#7c6ef7'}}>개인 키 발급받기 →</a>
            </div>

            <button
              onClick={()=>{
                localStorage.setItem('user_openai_key', userOpenAIKey);
                localStorage.setItem('user_youtube_key', userYoutubeKey);
                userOpenAIKeyRef.current = userOpenAIKey;
                userYoutubeKeyRef.current = userYoutubeKey;
                setYtRepVideos({});
                setYtRefetchTrigger(t => t + 1);
                setModal(null);
                showToast('설정이 저장됐어요!');
              }}
              className="btn-primary"
              style={{width:'100%',padding:'12px',borderRadius:'12px',fontSize:'15px',fontWeight:600}}
            >저장</button>
          </div>
        </div>
      </div>

      {/* Header */}
      <header className="app-header">
        <div className="header-content">
          <div className="header-baby" role="button" tabIndex={0}
            onClick={()=>{ if(appState.baby&&setupNameRef.current) setupNameRef.current.value=appState.baby.name; if(appState.baby&&setupBirthRef.current) setupBirthRef.current.value=appState.baby.birthDate; if(appState.baby) setSetupGender(appState.baby.gender); setModal('setup'); }}
            onKeyDown={e=>{ if(e.key==='Enter'||e.key===' ') setModal('setup'); }}>
            <div className="header-avatar">
              {babyPhoto
                ? <img src={babyPhoto} alt="아기" style={{width:'100%',height:'100%',objectFit:'cover',borderRadius:'50%'}} />
                : appState.baby?.gender==='boy'?'👦':'👧'}
            </div>
            <div>
              <div className="header-name">{appState.baby?.name ? `${appState.baby.name}의 기록` : '아기의 기록'}</div>
              <div className="header-age">
                {ageInfo ? (ageInfo.months < 1 ? `D+${ageInfo.diffDays} · ${ageInfo.weeks}주 ${ageInfo.remDays}일` : `D+${ageInfo.diffDays} · ${ageInfo.months}개월 ${ageInfo.monthRemDays}일`) : '정보 설정 필요'}
              </div>
            </div>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
            <div className="header-date" style={{whiteSpace:'pre-line'}}>{headerDate}</div>
            <button onClick={()=>setModal('settings')} aria-label="API 키 설정" style={{background:'none',border:'none',cursor:'pointer',padding:'4px',opacity:0.6,lineHeight:1}}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* Page Container */}
      <main className="page-container">

        {/* ❶ HOME */}
        <section id="page-home" className={`page${currentPage==='home'?' active':''}`}>
          <div className="page-scroll">
            {/* Baby Hero Card */}
            <div className="baby-hero-card">
              <div className="baby-hero-top">
                <div className="baby-face">
                  {babyPhoto
                    ? <img src={babyPhoto} alt="아기" style={{width:'100%',height:'100%',objectFit:'cover',borderRadius:'50%'}} />
                    : appState.baby?.gender==='boy'?'👦':'👧'}
                </div>
                <div className="baby-hero-info">
                  <div className="baby-hero-name hand" role="button" tabIndex={0} onClick={()=>{setModal('setup');}}>
                    {appState.baby?.name||'베이비'}<span className="hero-day-suffix">의 하루</span>
                  </div>
                  <div className="hero-pills-row">
                    {ageInfo && (
                      <span className="hero-info-pill">{ageInfo.months}개월 {ageInfo.monthRemDays}일</span>
                    )}
                    {(latestHeight || latestWeight) && (
                      <span className="hero-info-pill">
                        {[latestHeight ? `${latestHeight}cm` : null, latestWeight ? `${latestWeight}kg` : null].filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </div>
                </div>
                <button className="hero-edit-btn" onClick={()=>setModal('setup')} aria-label="아기 정보 수정">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20l4-1 11-11-3-3L5 16l-1 4z"/></svg>
                </button>
              </div>
              <div className="baby-hero-stats">
                {/* 수유 */}
                <div className="bhs-item">
                  {feedCount === 0 ? <div className="bhs-cat-lbl">🍼</div> : (
                    <div className="bhs-cols">
                      <div className="bhs-col">
                        <span className="bhs-col-num">{breastCount===0?'—':breastMl>0?`${breastMl}ml`:`${breastCount}회`}</span>
                        <span className="bhs-col-lbl">모유</span>
                      </div>
                      <div className="bhs-col">
                        <span className="bhs-col-num">{formulaCount===0?'—':formulaMl>0?`${formulaMl}ml`:`${formulaCount}회`}</span>
                        <span className="bhs-col-lbl">분유</span>
                      </div>
                    </div>
                  )}
                </div>
                <div className="bhs-divider"/>
                {/* 수면 */}
                <div className="bhs-item">
                  {sleepMin === 0 ? <div className="bhs-cat-lbl">😴</div> : (
                    <div className="bhs-cols">
                      <div className="bhs-col">
                        <span className="bhs-col-num">{fmtSleepTime(napSleepMin)}</span>
                        <span className="bhs-col-lbl">낮잠</span>
                      </div>
                      <div className="bhs-col">
                        <span className="bhs-col-num">{fmtSleepTime(nightSleepMin)}</span>
                        <span className="bhs-col-lbl">밤잠</span>
                      </div>
                    </div>
                  )}
                </div>
                <div className="bhs-divider"/>
                {/* 기저귀 */}
                <div className="bhs-item">
                  {diaperCount === 0 ? <div className="bhs-cat-lbl">💩</div> : (
                    <div className="bhs-cols">
                      <div className="bhs-col">
                        <span className="bhs-col-num">{peeCount}회</span>
                        <span className="bhs-col-lbl">소변</span>
                      </div>
                      <div className="bhs-col">
                        <span className="bhs-col-num">{poopCount}회</span>
                        <span className="bhs-col-lbl">대변</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* 날씨 & 미세먼지 */}
            {weather && (
              <div className="weather-bar">
                <div className="weather-left">
                  <img
                    className="weather-icon-img"
                    src={`https://openweathermap.org/img/wn/${weather.icon}.png`}
                    alt={weather.desc}
                  />
                  <span className="weather-temp">{weather.temp}°C</span>
                  <span className="weather-desc">{koWeatherDesc(weather.desc)}</span>
                  {weather.humidity !== null && (
                    <span className="weather-humidity">💧 {weather.humidity}%</span>
                  )}
                </div>
                <div className="weather-right">
                  {weather.pm10 !== null && (() => { const d=dustLevel(weather.pm10,'pm10'); return (
                    <span className={`dust-badge dust-${d.cls}`}>미세먼지 {d.label}</span>
                  ); })()}
                  {weather.pm25 !== null && (() => { const d=dustLevel(weather.pm25,'pm25'); return (
                    <span className={`dust-badge dust-${d.cls}`}>초미세먼지 {d.label}</span>
                  ); })()}
                </div>
              </div>
            )}

            {/* 다가오는 일정 */}
            <div className="section-card">
              <div className="section-header">
                <h3 className="section-title hand">다가오는 일정</h3>
                <button className="see-all-btn" onClick={()=>navigate('schedule')}>전체 →</button>
              </div>
              <div className="home-upcoming-list">
                {appState.todos.filter(t=>!t.completed).slice(0,3).length===0 ? (
                  <div className="empty-state" style={{padding:'12px'}}><div className="empty-icon" style={{fontSize:'28px'}}>📅</div><p style={{fontSize:'12px'}}>스케줄에서 항목을 추가해보세요</p></div>
                ) : appState.todos.filter(t=>!t.completed).slice(0,3).map(t=>(
                  <div key={t.id} className="upcoming-item">
                    <div className={`upcoming-cat-icon cat-${t.category}`}>{t.category==='vaccine'?'💉':t.category==='feeding'?'🍼':t.category==='play'?'🧸':t.category==='supplies'?'🛒':'📌'}</div>
                    <div className="upcoming-text"><div className="upcoming-title">{t.text}</div><div className="upcoming-cat">{CAT_LABELS[t.category]}</div></div>
                  </div>
                ))}
              </div>
            </div>

            {(quickFeedOpen||quickDiaperOpen||quickOtherOpen) && (
              <div style={{position:'fixed',inset:0,zIndex:150}} onClick={closeQuickMenus} />
            )}
            <div className="section-card">
              <h3 className="section-title hand">빠른 기록</h3>
              <div className="quick-grid">
                {/* 수유 */}
                <div className="quick-other-wrap">
                  <button className="quick-btn qbtn-feed" onClick={()=>{ closeQuickMenus(); setQuickFeedOpen(o=>!o); }}>
                    <span className="quick-icon">🍼</span><span>수유</span>
                  </button>
                  {quickFeedOpen && (
                    <div className="quick-other-menu">
                      {[
                        { icon:'🤱', label:'모유',     ft:'모유' },
                        { icon:'🍼', label:'분유',     ft:'분유' },
                        { icon:'🍶', label:'유축모유', ft:'유축모유' },
                        { icon:'🥣', label:'이유식',  ft:'이유식' },
                      ].map(item=>(
                        <button key={item.label} className="quick-other-item" onClick={()=>{ openAddLog('feed', item.ft); closeQuickMenus(); }}>
                          <span className="quick-other-icon">{item.icon}</span>{item.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {/* 기저귀 */}
                <div className="quick-other-wrap">
                  <button className="quick-btn qbtn-diaper" onClick={()=>{ closeQuickMenus(); setQuickDiaperOpen(o=>!o); }}>
                    <span className="quick-icon">💩</span><span>기저귀</span>
                  </button>
                  {quickDiaperOpen && (
                    <div className="quick-other-menu">
                      {[
                        { icon:'💧', label:'소변', type:'pee'  as LogType },
                        { icon:'💩', label:'대변', type:'poop' as LogType },
                      ].map(item=>(
                        <button key={item.label} className="quick-other-item" onClick={()=>{ openAddLog(item.type); closeQuickMenus(); }}>
                          <span className="quick-other-icon">{item.icon}</span>{item.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {/* 수면, 놀이, 목욕 */}
                {(['sleep','play','bath'] as LogType[]).map(type=>(
                  <button key={type} className={`quick-btn qbtn-${type}`} onClick={()=>{ closeQuickMenus(); openAddLog(type); }}>
                    <span className="quick-icon">{TYPE_ICONS[type]}</span><span>{TYPE_LABELS[type]}</span>
                  </button>
                ))}
                {/* 기타 */}
                <div className="quick-other-wrap">
                  <button className="quick-btn qbtn-other" onClick={()=>{ closeQuickMenus(); setQuickOtherOpen(o=>!o); }}>
                    <span className="quick-icon">⋯</span><span>기타</span>
                  </button>
                  {quickOtherOpen && (
                    <div className="quick-other-menu quick-other-menu-lg">
                      {[
                        { icon:'🌡️', label:'체온', action:()=>{ setHfType('temp');    openHealthModal('health');      closeQuickMenus(); } },
                        { icon:'🏥', label:'병원', action:()=>{ setHfType('symptom'); openHealthModal('health');      closeQuickMenus(); } },
                        { icon:'💊', label:'투약', action:()=>{ openHealthModal('medication');                        closeQuickMenus(); } },
                        { icon:'📏', label:'키/몸무게', action:()=>{ openAddLog('measure');                          closeQuickMenus(); } },
                        { icon:'😢', label:'울음', action:()=>{ openAddLog('cry');                                    closeQuickMenus(); } },
                        { icon:'🌿', label:'산책', action:()=>{ openAddLog('walk');                                   closeQuickMenus(); } },
                      ].map(item=>(
                        <button key={item.label} className="quick-other-item" onClick={item.action}>
                          <span className="quick-other-icon">{item.icon}</span>{item.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="section-card">
              <div className="section-header">
                <h3 className="section-title hand">최근 기록</h3>
                <button className="see-all-btn" onClick={()=>navigate('timeline')}>전체보기 →</button>
              </div>
              <div className="recent-logs-list">
                {recentLogs.length===0 ? (
                  <div className="empty-state"><div className="empty-icon">📋</div><p>아직 기록이 없어요<br/>위 버튼으로 첫 기록을 남겨보세요!</p></div>
                ) : recentLogs.map(l=>{
                  let detail = l.type==='feed'?(l.feedType||'수유'):TYPE_LABELS[l.type];
                  if(l.type==='feed'&&l.amount) detail+=` ${l.amount}ml`;
                  if(l.type==='sleep'&&l.endTime) detail+=` (${fmtDuration(l.startTime!,l.endTime)})`;
                  if(l.type==='poop'&&l.color) detail+=` · ${l.color}`;
                  return (
                    <div key={l.id} className="log-item">
                      <div className={`log-dot ${l.type}`}></div>
                      <span className="log-time">{l.startTime||l.time||''}</span>
                      <span className="log-text">{TYPE_ICONS[l.type]} {detail}</span>
                      {l.note && <span className="log-note">{l.note}</span>}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="section-card">
              <h3 className="section-title hand">오늘의 알림 🔔</h3>
              <div className="alerts-list">
                {alerts.length===0 ? (
                  <div className="empty-state" style={{padding:'12px'}}><div className="empty-icon" style={{fontSize:'28px'}}>🔕</div><p style={{fontSize:'12px'}}>오늘은 특별한 알림이 없어요</p></div>
                ) : alerts.slice(0,3).map((a,i)=>(
                  <div key={i} className="alert-item"><span className="alert-icon">{a.icon}</span><span className="alert-text">{a.text}</span></div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ❷ TIMELINE */}
        <section id="page-timeline" className={`page${currentPage==='timeline'?' active':''}`} style={{display:'flex',flexDirection:'column'}}>
          <div className="date-nav">
            <button className="date-nav-btn" onClick={()=>setTimelineDate(d=>shiftDate(d,-1))} aria-label="이전 날">‹</button>
            <span className="date-nav-title">{fmtDisplayDate(timelineDate)}</span>
            <button className="date-nav-btn" onClick={()=>{ if(timelineDate>=todayStr()){showToast('오늘 이후의 날짜는 볼 수 없어요');return;} setTimelineDate(d=>shiftDate(d,1)); }} aria-label="다음 날">›</button>
          </div>
          <div className="timeline-legend">
            {([
              ['sleep','sleep-lg','😴 수면'],
              ['feed','feed-lg','🍼 수유'],
              ['pee','pee-lg','💧 소변'],
              ['poop','poop-lg','💩 대변'],
              ['cry','cry-lg','😢 울음'],
              ['walk','walk-lg','🌿 산책'],
              ['play','play-lg','🧸 놀이'],
              ['bath','bath-lg','🛁 목욕'],
              ['measure','measure-lg','📏 키/몸무게'],
              ['other','other-lg','📝 기타'],
            ] as [LogType,string,string][]).map(([type,cls,label])=>(
              <button key={type} className={`legend-item ${cls}`} onClick={()=>openAddLog(type)}>
                {label}
              </button>
            ))}
          </div>
          <div className="timeline-scroll-wrapper" ref={timelineScrollRef}>
            <div className="timeline-canvas">
              <div className="tl-axis">
                {hourLabels.map(({h,label})=>(
                  <div key={h} className="tl-hour-label" style={{top:`${h*60}px`}}>{label}</div>
                ))}
              </div>
              <div className="tl-body">
                {hourLabels.map(({h})=>(
                  <div key={h} className="tl-gridline" style={{top:`${h*60}px`}} />
                ))}
                {timelineDate===todayStr() && (
                  <div className="tl-now-line" style={{top:`${nowMin}px`}} />
                )}
                {timelineLogs.length===0 && (
                  <div className="tl-empty-msg"><div className="empty-icon">📅</div><p>이 날의 기록이 없어요<br/>+ 버튼으로 추가해보세요</p></div>
                )}
                {timelineLayout.map(({log, top, height, col, totalCols})=>{
                  const leftPct  = (col / totalCols) * 100;
                  const left  = col === 0            ? '4px'  : `calc(${leftPct}% + 2px)`;
                  const right = col === totalCols-1  ? '4px'  : `calc(${(1 - (col+1)/totalCols)*100}% + 2px)`;
                  const feedLabel = log.type==='feed'?(log.feedType||'수유'):TYPE_LABELS[log.type];
                  let label = TYPE_ICONS[log.type]+' '+feedLabel;
                  if(totalCols > 1) label = TYPE_ICONS[log.type]; // 좁을 땐 아이콘만
                  if(totalCols === 1) {
                    if(log.type==='feed'&&log.amount) label+=` ${log.amount}ml`;
                    if(log.type==='sleep'&&log.endTime) label+=` (${fmtDuration(log.startTime!,log.endTime)})`;
                    if(log.type==='walk'&&log.endTime) label+=` (${fmtDuration(log.startTime!,log.endTime)})`;
                  }
                  const fullLabel = (() => {
                    let l = TYPE_ICONS[log.type]+' '+feedLabel;
                    if(log.type==='feed'&&log.amount) l+=` ${log.amount}ml`;
                    if(log.type==='sleep'&&log.endTime) l+=` (${fmtDuration(log.startTime!,log.endTime)})`;
                    if(log.type==='walk'&&log.endTime) l+=` (${fmtDuration(log.startTime!,log.endTime)})`;
                    return l;
                  })();
                  return (
                    <div key={log.id} className={`tl-block ${log.type}`}
                      style={{top:`${top}px`, height:`${height}px`, left, right, width:'auto'}}
                      title={fullLabel}
                      onClick={()=>openLogDetail(timelineDate,log)}>
                      {height>=28 ? label : TYPE_ICONS[log.type]}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <button className="fab-btn" onClick={()=>openAddLog('sleep')} aria-label="기록 추가">+</button>
        </section>

        {/* ❸ SCHEDULE */}
        <section id="page-schedule" className={`page${currentPage==='schedule'?' active':''}`} style={{display:'flex',flexDirection:'column'}}>
          <div className="cat-tabs" role="tablist">
            {(['all','vaccine','feeding','play','supplies','other'] as (TodoFilter)[]).map(cat=>(
              <button key={cat} className={`cat-tab${todoFilter===cat?' active':''}`} role="tab" onClick={()=>setTodoFilter(cat)}>
                {cat==='all'?'전체':cat==='vaccine'?'💉 예방접종':cat==='feeding'?'🍼 수유':cat==='play'?'🧸 놀이':cat==='supplies'?'🛒 생필품':'📌 기타'}
              </button>
            ))}
          </div>
          <div className="page-scroll" style={{paddingTop:'8px'}}>
            <div className="section-card">
              <h3 className="section-title hand">일정 기록</h3>
              <div className="todo-add-row">
                <input ref={todoInputRef} type="text" className="todo-input" placeholder="새 항목을 입력하세요..." autoComplete="off"
                  onKeyDown={e=>{ if(e.key==='Enter'){e.preventDefault();addTodo();} }} />
                <select className="todo-cat-select" value={todoCat} onChange={e=>setTodoCat(e.target.value as TodoCat)}>
                  <option value="other">📌 기타</option><option value="vaccine">💉 예방</option>
                  <option value="feeding">🍼 수유</option>
                  <option value="play">🧸 놀이</option><option value="supplies">🛒 생필품</option>
                </select>
                <button className="btn-primary" onClick={addTodo}>추가</button>
              </div>
              <div style={{marginTop:'8px'}}>
                <input type="date" className="todo-date-input" value={todoDate} onChange={e=>setTodoDate(e.target.value)} />
              </div>
            </div>
            <div className="todo-list" role="list" style={{paddingBottom:'var(--sp-md)'}}>

              {sortedTodos.length===0 ? (
                <div className="empty-state"><div className="empty-icon">✅</div><p>등록된 항목이 없어요<br/>예방접종, 분유량 등을 추가해보세요!</p></div>
              ) : sortedTodos.map(todo=>(
                <div key={todo.id} className={`todo-item${todo.completed?' completed':''}`} role="listitem">
                  <div className={`todo-check${todo.completed?' checked':''}`} onClick={()=>toggleTodo(todo.id)} style={{cursor:'pointer'}}>
                    {todo.completed?'✓':''}
                  </div>
                  <div className="todo-info">
                    <div className="todo-text">{todo.text}</div>
                    <div className="todo-meta">
                      <span className={`todo-badge badge-${todo.category}`}>{CAT_LABELS[todo.category]}</span>
                      {todo.date && (() => { const [,m,d]=todo.date!.split('-').map(Number); return <span className="todo-date-badge">{m}/{d}</span>; })()}
                      <button className="todo-ask-btn" onClick={()=>{ navigate('chat'); const q:Record<TodoCat,string>={vaccine:'예방접종 일정 알려줘',feeding:'이유식 언제 시작해요?',play:'이 시기 추천 장난감 알려줘',supplies:'아기 생필품 추천해줘',other:'아기 건강 정보 알려줘'}; setTimeout(()=>sendChat(q[todo.category]),300); }}>💬 챗봇에게 묻기</button>
                    </div>
                  </div>
                  <div className="todo-actions">
                    <button className="todo-delete-btn" onClick={()=>deleteTodo(todo.id)}>✕</button>
                  </div>
                </div>
              ))}
            </div>

            {/* 맞춤 키워드 카드 */}
            <div className="section-card">
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'10px'}}>
                <h3 className="section-title hand" style={{margin:0}}>맞춤 키워드 확인</h3>
                {ageInfo && <span className="shop-age-badge">{ageInfo.months}개월 맞춤</span>}
              </div>
              <div className="shop-flow-desc">키워드를 눌러 YouTube, 당근마켓, 맘가이드에서 검색해보세요</div>
              <div className="kw-chips">
                {(ageInfo ? getShopKeywordsForAge(ageInfo.months) : SHOP_KEYWORDS['4-6']).map(kw=>(
                  <button key={kw} className="kw-chip" onClick={()=>{ setKwPickerKeyword(kw); setKwPickerOpen(true); }}>{kw}</button>
                ))}
              </div>
              <div className="shop-grid">
                {[
                  { icon:'🎬', name:'YouTube', desc:'키워드로 육아 영상 검색', cls:'shop-yt', href:`https://www.youtube.com/results?search_query=${encodeURIComponent((ageInfo?`${ageInfo.months}개월 아기 `:'아기 ')+'육아 정보')}` },
                  { icon:'🥕', name:'당근마켓', desc:'중고 장난감·아이템 검색', cls:'shop-dg', href:`https://www.daangn.com/search/${encodeURIComponent((ageInfo?`${ageInfo.months}개월 아기 `:'아기 ')+'장난감')}` },
                  { icon:'🧴', name:'맘가이드', desc:'성분 안전성 확인', cls:'shop-mg', href:`https://momguide.co.kr/search/?q=${encodeURIComponent('아기')}` },
                ].map(({icon,name,desc,cls,href})=>(
                  <a key={name} className="shop-item" href={href} target="_blank" rel="noopener noreferrer">
                    <div className={`shop-item-icon ${cls}`}>{icon}</div>
                    <div className="shop-item-info"><div className="shop-item-name">{name}</div><div className="shop-item-desc">{desc}</div></div>
                    <svg className="shop-arrow" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10 6l6 6-6 6"/></svg>
                  </a>
                ))}
              </div>
            </div>

            {/* 육아 달력 */}
            <div className="section-card">
              <h3 className="section-title hand">육아 달력</h3>
              <div className="cal-legend-row" style={{marginBottom:'12px'}}>
                <div className="cal-legend-dot dot-vaccine"></div><span>접종</span>
                <div className="cal-legend-dot dot-food" style={{marginLeft:'8px'}}></div><span>이유식</span>
                <div className="cal-legend-dot dot-check" style={{marginLeft:'8px'}}></div><span>검진</span>
              </div>
              <div className="cal-nav">
                <button className="cal-nav-btn" onClick={prevCalMonth}>‹</button>
                <span className="cal-month-label">{calYear}년 {calMonth+1}월</span>
                <button className="cal-nav-btn" onClick={nextCalMonth}>›</button>
              </div>
              <div className="cal-grid-header">
                {['일','월','화','수','목','금','토'].map(d=><span key={d}>{d}</span>)}
              </div>
              <div className="cal-grid">
                {(() => {
                  const today = new Date();
                  const firstDow = new Date(calYear, calMonth, 1).getDay();
                  const daysInMon = new Date(calYear, calMonth+1, 0).getDate();
                  const daysInPrev = new Date(calYear, calMonth, 0).getDate();
                  const birthStr = appState.baby?.birthDate || null;
                  const eventsThisMonth = birthStr ? getMilestonesForMonth(birthStr, calYear, calMonth) : [];
                  const dayEventsMap: Record<number, Set<string>> = {};
                  for (const ev of eventsThisMonth) {
                    const d = ev.date.getDate();
                    if (!dayEventsMap[d]) dayEventsMap[d] = new Set();
                    dayEventsMap[d].add(ev.type);
                  }
                  const catToDotType: Record<TodoCat, string> = { vaccine:'vaccine', feeding:'food', play:'check', supplies:'check', other:'check' };
                  for (const todo of appState.todos) {
                    if (!todo.date) continue;
                    const [ty, tm, td] = todo.date.split('-').map(Number);
                    if (ty !== calYear || tm - 1 !== calMonth) continue;
                    if (!dayEventsMap[td]) dayEventsMap[td] = new Set();
                    dayEventsMap[td].add(catToDotType[todo.category]);
                  }
                  const cells: React.ReactElement[] = [];
                  for (let i=firstDow-1;i>=0;i--) cells.push(<div key={`prev-${i}`} className="cal-cell other-month">{daysInPrev-i}</div>);
                  for (let d=1;d<=daysInMon;d++) {
                    const dow = new Date(calYear,calMonth,d).getDay();
                    const isToday = today.getFullYear()===calYear&&today.getMonth()===calMonth&&today.getDate()===d;
                    const cls = ['cal-cell',isToday?'today':'',dow===0?'sun':dow===6?'sat':''].filter(Boolean).join(' ');
                    cells.push(
                      <div key={d} className={cls}>
                        {d}
                        {dayEventsMap[d] && <div className="cal-dots">{[...dayEventsMap[d]].map(t=><div key={t} className={`cal-dot dot-${t}`}/>)}</div>}
                      </div>
                    );
                  }
                  const filled = firstDow+daysInMon;
                  const tail = (7-(filled%7))%7;
                  for (let d=1;d<=tail;d++) cells.push(<div key={`next-${d}`} className="cal-cell other-month">{d}</div>);
                  return cells;
                })()}
              </div>
              <div className="cal-events">
                {!appState.baby?.birthDate ? (
                  <div className="cal-no-baby">아기 정보를 먼저 등록해주세요 👶</div>
                ) : (() => {
                  const evs = getMilestonesForMonth(appState.baby.birthDate, calYear, calMonth);
                  const catToDotType: Record<TodoCat, string> = { vaccine:'vaccine', feeding:'food', play:'check', supplies:'check', other:'check' };
                  const todosThisMonth = appState.todos.filter(t => {
                    if (!t.date) return false;
                    const [ty, tm] = t.date.split('-').map(Number);
                    return ty === calYear && tm - 1 === calMonth;
                  }).sort((a, b) => (a.date||'').localeCompare(b.date||''));
                  const typeLabel: Record<string,string> = { vaccine:'💉 접종', food:'🥣 이유식', check:'🏥 검진' };
                  const catLabel: Record<TodoCat,string> = { vaccine:'💉 예방접종', feeding:'🍼 수유', play:'🧸 놀이', supplies:'🛒 생필품', other:'📌 기타' };
                  const total = evs.length + todosThisMonth.length;
                  if (total === 0) return <div className="cal-events-empty">이 달에는 일정이 없어요 🌱</div>;
                  return <>
                    <div className="cal-events-title">이달의 일정 ({total}건)</div>
                    {evs.map((ev,i)=>(
                      <div key={`ev-${i}`} className="cal-event-item">
                        <div className={`cal-event-date type-${ev.type}`}>{ev.date.getMonth()+1}월<br/>{ev.date.getDate()}일</div>
                        <div className="cal-event-info">
                          <div className="cal-event-label">{ev.label}</div>
                          <div className="cal-event-sub">{ev.sub}</div>
                        </div>
                        <div className={`cal-event-badge type-${ev.type}`}>{typeLabel[ev.type]}</div>
                      </div>
                    ))}
                    {todosThisMonth.map(todo=>{
                      const [,tm,td] = (todo.date||'').split('-').map(Number);
                      const dotType = catToDotType[todo.category];
                      return (
                        <div key={todo.id} className="cal-event-item">
                          <div className={`cal-event-date type-${dotType}`}>{tm}월<br/>{td}일</div>
                          <div className="cal-event-info">
                            <div className="cal-event-label">{todo.text}</div>
                            <div className="cal-event-sub">{catLabel[todo.category]}</div>
                          </div>
                          <div className={`cal-event-badge type-${dotType}`}>{todo.completed ? '✓ 완료' : '예정'}</div>
                        </div>
                      );
                    })}
                  </>;
                })()}
              </div>
            </div>
          </div>
        </section>

        {/* ❹ HEALTH */}
        <section id="page-health" className={`page${currentPage==='health'?' active':''}`} style={{display:'flex',flexDirection:'column'}}>
          <div className="h-tabs" role="tablist">
            {([['development','발달체크'],['logs','건강기록'],['medication','복약정보'],['report','리포트']] as [HealthTab,string][]).map(([tab,label])=>(
              <button key={tab} className={`h-tab${healthTab===tab?' active':''}`} role="tab" onClick={()=>setHealthTab(tab)}>{label}</button>
            ))}
          </div>

          {/* Development Tab */}
          <div className={`h-section${healthTab==='development'?' active':''} page-scroll`}>
            <div className="section-card">
              {ageInfo ? (
                <>
                  <div className="dev-age-banner">
                    <h3>현재 {ageInfo.months}개월 ({ageInfo.weeks}주)</h3>
                    <p>{appState.baby?.name}{koreanParticle(appState.baby?.name||'','이의','의')} 발달 체크리스트예요</p>
                  </div>
                  {getMilestones(ageInfo.months).map(group=>(
                    <div key={group.title} className="milestone-group">
                      <div className="milestone-group-title">{group.icon} {group.title}</div>
                      {group.items.map(item=>(
                        <div key={item.id} className="milestone-item" onClick={()=>toggleMilestone(item.id)} tabIndex={0}
                          onKeyDown={e=>{ if(e.key==='Enter'||e.key===' ') toggleMilestone(item.id); }}>
                          <div className={`milestone-check${appState.development[item.id]?' done':''}`}>{appState.development[item.id]?'✓':''}</div>
                          <span className="milestone-text">{item.text}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                  {getMilestones(ageInfo.months).length===0 && (
                    <div className="empty-state"><div className="empty-icon">🌱</div><p>현재 연령의 발달 체크리스트를<br/>준비 중이에요</p></div>
                  )}
                </>
              ) : (
                <div className="empty-state"><div className="empty-icon">👶</div><p>아기 정보를 설정해주세요</p></div>
              )}
            </div>
          </div>

          {/* Health Logs Tab */}
          <div className={`h-section${healthTab==='logs'?' active':''} page-scroll`}>
            <div className="section-card">
              <div className="section-header">
                <h3 className="section-title-lg hand">건강 기록</h3>
                <button className="btn-secondary" onClick={()=>openHealthModal('health')}>+ 추가</button>
              </div>
              <div className="health-logs-list">
                {(!appState.health.logs||appState.health.logs.length===0) ? (
                  <div className="empty-state"><div className="empty-icon">🌡️</div><p>건강 기록이 없어요<br/>체온, 피부 발진 등을 기록해보세요</p></div>
                ) : [...appState.health.logs].sort((a,b)=>(b.date+b.time).localeCompare(a.date+a.time)).map(l=>(
                  <div key={l.id} className="health-log-item">
                    <span className={`hl-badge ${l.type}`}>{{temp:'체온',rash:'피부',symptom:'증상',other:'기타'}[l.type]}</span>
                    <div><div className="hl-detail">{l.detail}</div><div className="hl-time">{l.date} {l.time}</div></div>
                  </div>
                ))}
              </div>
            </div>
            <div className="section-card">
              <p className="info-note">💡 비대면 진료가 필요하시면 아래 서비스를 이용해보세요</p>
              <div className="telehealth-links">
                {([{icon:'🏥',name:'닥터나우',desc:'24시간 비대면 진료 서비스',url:'https://www.doctornow.co.kr'},{icon:'👨‍⚕️',name:'올라케어',desc:'소아과 전문 비대면 상담',url:'https://www.ollacare.com'}] as {icon:string;name:string;desc:string;url:string}[]).map(({icon,name,desc,url})=>(
                  <a key={name} href={url} target="_blank" rel="noopener noreferrer" className="telehealth-card" style={{textDecoration:'none',color:'inherit'}}>
                    <span className="telehealth-icon">{icon}</span>
                    <div><strong>{name}</strong><p>{desc}</p></div>
                  </a>
                ))}
              </div>
            </div>
          </div>

          {/* Medication Tab */}
          <div className={`h-section${healthTab==='medication'?' active':''} page-scroll`}>
            <div className="section-card">
              <div className="section-header">
                <h3 className="section-title-lg hand">복약 정보</h3>
                <button className="btn-secondary" onClick={()=>openHealthModal('medication')}>+ 추가</button>
              </div>
              <div className="medication-list">
                {(!appState.health.medications||appState.health.medications.length===0) ? (
                  <div className="empty-state"><div className="empty-icon">💊</div><p>복약 정보가 없어요<br/>처방된 약 정보를 기록해보세요</p></div>
                ) : [...appState.health.medications].sort((a,b)=>b.date.localeCompare(a.date)).map(m=>(
                  <div key={m.id} className="med-item">
                    <div className="med-name">💊 {m.name}</div>
                    <div className="med-detail">{m.dose?m.dose+' · ':''}{m.freq||''}{m.note?' · '+m.note:''}<span style={{marginLeft:'4px',color:'var(--text-light)',fontSize:'11px'}}>{m.date}</span></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          {/* Report Tab */}
          <div id="rpt-print-area" className={`h-section${healthTab==='report'?' active':''} page-scroll`}>
            {/* Hero card */}
            <div className="section-card rpt-hero">
              <div className="rpt-title-row">
                <div>
                  <div className="rpt-title">육아 리포트</div>
                  <div className="rpt-baby-info">
                    {appState.baby && ageInfo
                      ? `${appState.baby.name} · ${ageInfo.months}개월 ${ageInfo.monthRemDays}일`
                      : appState.baby ? `${appState.baby.name}` : '아기 정보 없음'}
                  </div>
                </div>
                <div className="rpt-actions">
                  <button className="rpt-act-btn" onClick={handleDownload} title="다운로드">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                  </button>
                  <button className="rpt-act-btn" onClick={handleShare} title="공유">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                  </button>
                </div>
              </div>
              <div style={{marginTop:'12px'}}>
                <div className="rpt-seg">
                  <button className={`rpt-seg-btn${reportMode==='week'?' active':''}`} onClick={()=>setReportMode('week')}>주간</button>
                  <button className={`rpt-seg-btn${reportMode==='month'?' active':''}`} onClick={()=>setReportMode('month')}>월간</button>
                </div>
              </div>
            </div>

            <div className="rpt-print-cols">
              <div className="rpt-col-left">
                {/* Activity chart */}
                <div className="section-card">
                  <div className="section-header">
                    <h3 className="section-title hand rpt-section-title">생활 패턴</h3>
                  </div>
                  <div className="activity-legend">
                    <div className="act-legend-item"><div className="act-legend-dot act-sleep-dot"/><span>수면</span></div>
                    <div className="act-legend-item"><div className="act-legend-dot act-feed-dot"/><span>수유</span></div>
                    <div className="act-legend-item"><div className="act-legend-dot act-diaper-dot"/><span>기저귀</span></div>
                  </div>
                  <div className="activity-chart" dangerouslySetInnerHTML={{__html: buildActivityChartHTML(appState.logs, reportMode)}} />
                </div>
              </div>

              <div className="rpt-col-right">
                {/* Height growth chart */}
                <div className="section-card">
                  <div className="section-header">
                    <h3 className="section-title hand rpt-section-title">키 성장 곡선</h3>
                    <button className="btn-secondary" onClick={()=>{ setGDate(todayStr()); setGHeight(''); setGWeight(''); setShowGrowthForm(v=>!v); }}>
                      {showGrowthForm ? '닫기' : '+ 기록'}
                    </button>
                  </div>
                  {showGrowthForm && (
                    <div className="growth-form">
                      <div className="growth-input-row">
                        <input type="date" className="growth-in" value={gDate} onChange={e=>setGDate(e.target.value)} style={{flex:'1.2'}} />
                        <input type="number" className="growth-in" placeholder="키 (cm)" value={gHeight} onChange={e=>setGHeight(e.target.value)} step="0.1" min="30" max="120" />
                        <input type="number" className="growth-in" placeholder="몸무게 (kg)" value={gWeight} onChange={e=>setGWeight(e.target.value)} step="0.01" min="1" max="20" />
                        <button className="btn-primary" style={{padding:'8px 12px',fontSize:'12px'}} onClick={saveGrowth}>저장</button>
                      </div>
                    </div>
                  )}
                  <div className="growth-chart-wrap">
                    <div dangerouslySetInnerHTML={{__html: buildGrowthSVG(appState.growth, 'height', appState.baby?.gender || 'girl', appState.baby?.birthDate)}} />
                  </div>
                  {(() => {
                    const sorted = [...appState.growth].filter(r => r.height != null).sort((a,b)=>b.date.localeCompare(a.date));
                    const latest = sorted[0];
                    if (!latest || !ageInfo) return null;
                    const result = calcPercentile(latest.height!, ageInfo.months, 'height', appState.baby?.gender || 'girl');
                    return (
                      <div className="growth-percentile-badge">
                        <div className="growth-pct-row">
                          <div className="growth-pct-icon">{result.emoji}</div>
                          <div>
                            <div className="growth-pct-label">{latest.height}cm — {result.label}</div>
                            <div className="growth-pct-sub">WHO 성장 기준 (P3/P50/P97)</div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Weight growth chart */}
                <div className="section-card">
                  <h3 className="section-title hand rpt-section-title">몸무게 성장 곡선</h3>
                  <div className="growth-chart-wrap">
                    <div dangerouslySetInnerHTML={{__html: buildGrowthSVG(appState.growth, 'weight', appState.baby?.gender || 'girl', appState.baby?.birthDate)}} />
                  </div>
                  {(() => {
                    const sorted = [...appState.growth].filter(r => r.weight != null).sort((a,b)=>b.date.localeCompare(a.date));
                    const latest = sorted[0];
                    if (!latest || !ageInfo) return null;
                    const result = calcPercentile(latest.weight!, ageInfo.months, 'weight', appState.baby?.gender || 'girl');
                    return (
                      <div className="growth-percentile-badge">
                        <div className="growth-pct-row">
                          <div className="growth-pct-icon">{result.emoji}</div>
                          <div>
                            <div className="growth-pct-label">{latest.weight}kg — {result.label}</div>
                            <div className="growth-pct-sub">WHO 성장 기준 (P3/P50/P97)</div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                  {appState.growth.length > 0 && (
                    <div className="growth-records">
                      {[...appState.growth].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,5).map(r=>(
                        <div key={r.id} className="growth-rec-row">
                          <span className="growth-rec-date">{r.date}</span>
                          <span className="growth-rec-vals">{r.height!=null?`${r.height}cm`:''}{r.height!=null&&r.weight!=null?' · ':''}{r.weight!=null?`${r.weight}kg`:''}</span>
                          <button className="growth-rec-del" onClick={()=>deleteGrowth(r.id)}>✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Health issues */}
                <div className="section-card">
                  <h3 className="section-title hand rpt-section-title">최근 건강 이슈</h3>
                  {(!appState.health.logs || appState.health.logs.length === 0) ? (
                    <div className="rpt-empty-sm">해당 내용이 없습니다</div>
                  ) : (
                    <div className="rpt-issues">
                      {[...appState.health.logs].sort((a,b)=>(b.date+b.time).localeCompare(a.date+a.time)).slice(0,5).map(l=>(
                        <div key={l.id} className="rpt-issue-card">
                          <div className="rpt-issue-top">
                            <span className="rpt-issue-type">{{temp:'체온',rash:'피부',symptom:'증상',other:'기타'}[l.type]}</span>
                            <span className="rpt-issue-date">{l.date} {l.time}</span>
                          </div>
                          <div className="rpt-issue-detail">{l.detail}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>{/* rpt-col-right */}
            </div>{/* rpt-print-cols */}
          </div>
        </section>

        {/* ❺ CHAT */}
        <section id="page-chat" className={`page page-chat-layout${currentPage==='chat'?' active':''}`}>
          <div className="chat-bot-header">
            <div className="bot-avatar-lg">🤱</div>
            <div><div className="bot-name">{appState.baby?.name ? `${appState.baby.name}의 기록` : '아기의 기록'}</div><div className="bot-status">🤖 RAG AI 모드</div></div>
          </div>
          <div className="chat-messages" ref={chatMessagesRef}>
            {chatMessages.map(msg=>(
              <div key={msg.id} className={`chat-msg ${msg.role}`}>
                {msg.role==='bot' && <div className="msg-avatar">🤱</div>}
                {msg.isTyping ? (
                  <div className="typing-indicator"><div className="typing-dot"/><div className="typing-dot"/><div className="typing-dot"/></div>
                ) : (
                  msg.role==='bot'
                    ? <div className="msg-bubble" dangerouslySetInnerHTML={{__html:msg.html}} />
                    : <div className="msg-bubble" dangerouslySetInnerHTML={{__html:msg.html}} />
                )}
              </div>
            ))}
          </div>
          <div className="quick-replies">
            {(()=>{
              const m = ageInfo?.months ?? null;
              const chips: {msg:string;label:string}[] =
                m === null ? [
                  {msg:'아기 발달 단계 알려줘',      label:'👶 발달 단계'},
                  {msg:'예방접종 일정 알려줘',        label:'💉 예방접종'},
                  {msg:'신생아 수유 방법 알려줘',     label:'🍼 수유 방법'},
                  {msg:'아기 수면 교육 방법 알려줘',  label:'😴 수면 교육'},
                  {msg:'이유식 시작 시기 알려줘',     label:'🥣 이유식'},
                  {msg:'이 시기 추천 장난감 알려줘',  label:'🎮 장난감'},
                  {msg:'아기 울음 달래는 방법',       label:'😢 울음 달래기'},
                  {msg:'신생아 배꼽 관리 방법',       label:'🩹 배꼽 관리'},
                ] :
                m < 1 ? [
                  {msg:'신생아 황달 대처법 알려줘',   label:'🌡️ 황달'},
                  {msg:'신생아 배앓이 달래는 방법',   label:'😣 배앓이'},
                  {msg:'모유수유 자세와 방법 알려줘', label:'🤱 모유수유'},
                  {msg:'신생아 분유 먹이는 방법',     label:'🍼 분유 수유'},
                  {msg:'신생아 수면 패턴 알려줘',     label:'😴 수면 패턴'},
                  {msg:'BCG 예방접종 언제 맞혀야 해', label:'💉 BCG 접종'},
                  {msg:'신생아 배꼽 관리 방법',       label:'🩹 배꼽 관리'},
                  {msg:'신생아 목욕 방법 알려줘',     label:'🛁 목욕 방법'},
                ] :
                m < 3 ? [
                  {msg:`${m}개월 아기 발달 정보 알려줘`,  label:`👶 ${m}개월 발달`},
                  {msg:'월령별 분유량 알려줘',             label:'🍼 분유량'},
                  {msg:'배앓이 달래는 방법 알려줘',        label:'😣 배앓이'},
                  {msg:'예방접종 일정 알려줘',             label:'💉 예방접종'},
                  {msg:'아기 수면 교육 방법 알려줘',       label:'😴 수면 교육'},
                  {msg:`${m}개월 아기 추천 장난감 알려줘`, label:'🎮 장난감'},
                  {msg:'아기 뒤집기 시작 시기 알려줘',     label:'🔄 뒤집기'},
                  {msg:'신생아 옹알이 발달 과정',          label:'💬 옹알이'},
                ] :
                m < 6 ? [
                  {msg:`${m}개월 아기 발달 정보 알려줘`,  label:`👶 ${m}개월 발달`},
                  {msg:'이유식 시작 시기와 방법 알려줘',   label:'🥣 이유식 시작'},
                  {msg:'예방접종 일정 알려줘',             label:'💉 예방접종'},
                  {msg:`${m}개월 분유량 알려줘`,           label:'🍼 분유량'},
                  {msg:`${m}개월 아기 추천 장난감 알려줘`, label:'🎮 장난감'},
                  {msg:'아기 뒤집기 연습 방법 알려줘',     label:'🔄 뒤집기'},
                  {msg:'아기 목 가누기 발달 시기',         label:'🧠 목 가누기'},
                  {msg:'아기 수면 교육 방법 알려줘',       label:'😴 수면 교육'},
                ] :
                m < 9 ? [
                  {msg:`${m}개월 아기 발달 정보 알려줘`,  label:`👶 ${m}개월 발달`},
                  {msg:'초기 이유식 레시피 알려줘',        label:'🥣 초기 이유식'},
                  {msg:'이유식 알레르기 주의 식재료',      label:'⚠️ 알레르기'},
                  {msg:'예방접종 이유식 시작 후 일정',     label:'💉 예방접종'},
                  {msg:'빨대컵 연습 시작 시기',            label:'🥤 빨대컵'},
                  {msg:`${m}개월 아기 추천 장난감 알려줘`, label:'🎮 장난감'},
                  {msg:'이앓이 시기와 대처법',             label:'🦷 이앓이'},
                  {msg:'아기 앉기 연습 방법',              label:'🪑 앉기 연습'},
                ] :
                m < 12 ? [
                  {msg:`${m}개월 아기 발달 정보 알려줘`,   label:`👶 ${m}개월 발달`},
                  {msg:'중기 후기 이유식 레시피 알려줘',   label:'🥣 이유식 레시피'},
                  {msg:'영유아 검진 무엇을 확인하나요',    label:'🏥 영유아 검진'},
                  {msg:`${m}개월 아기 추천 장난감 알려줘`, label:'🎮 장난감'},
                  {msg:'아기 첫 걸음마 준비 방법',         label:'🚶 걸음마 준비'},
                  {msg:'아기 손가락 음식 추천',            label:'🍌 핑거푸드'},
                  {msg:'아기 언어 발달 자극 방법',         label:'💬 언어 발달'},
                  {msg:'이앓이 시기와 대처법',             label:'🦷 이앓이'},
                ] :
                m < 18 ? [
                  {msg:`${m}개월 아기 발달 정보 알려줘`,   label:`👶 ${m}개월 발달`},
                  {msg:'생우유 전환 시기와 방법 알려줘',   label:'🥛 생우유 전환'},
                  {msg:'돌 이후 식단 구성 알려줘',         label:'🍽️ 돌 이후 식단'},
                  {msg:'MMR 수두 예방접종 알려줘',         label:'💉 MMR·수두'},
                  {msg:`${m}개월 아기 추천 장난감 알려줘`, label:'🎮 장난감'},
                  {msg:'아기 걸음마 완성 시기 알려줘',     label:'🚶 걸음마'},
                  {msg:'아기 첫 단어 언어 발달',           label:'💬 언어 발달'},
                  {msg:'영유아 검진 무엇을 확인하나요',    label:'🏥 영유아 검진'},
                ] : [
                  {msg:`${m}개월 아기 발달 정보 알려줘`,   label:`👶 ${m}개월 발달`},
                  {msg:'두돌 아기 언어 발달 알려줘',       label:'💬 언어 발달'},
                  {msg:`${m}개월 아기 추천 장난감 알려줘`, label:'🎮 장난감'},
                  {msg:'A형간염 예방접종 알려줘',          label:'💉 A형간염'},
                  {msg:'영유아 검진 무엇을 확인하나요',    label:'🏥 영유아 검진'},
                  {msg:'아기 편식 대처 방법 알려줘',       label:'🥦 편식 대처'},
                  {msg:'아이 훈육 방법 알려줘',            label:'🧑‍🏫 훈육 방법'},
                  {msg:'아기 수면 습관 개선 방법',         label:'😴 수면 습관'},
                ];
              return chips.map(({msg,label})=>(
                <button key={msg} className="qr-btn" onClick={()=>sendChat(msg)}>{label}</button>
              ));
            })()}
          </div>
          <div className="chat-input-row">
            <input type="text" className="chat-input" placeholder="궁금한 것을 물어보세요..." value={chatInput}
              onChange={e=>setChatInput(e.target.value)}
              onKeyDown={e=>{ if(e.key==='Enter'){e.preventDefault();sendChat(chatInput);} }} />
            <button className="chat-send-btn" onClick={()=>sendChat(chatInput)}>↑</button>
          </div>
        </section>

        {/* ❻ INFO */}
        <section id="page-info" className={`page${currentPage==='info'?' active':''}`}>
          <div className="page-scroll">


            {ytView === 'home' ? (
              <>
                {/* Stage Banner */}
                {ageInfo && appState.baby && (
                  <div className="yt-stage-banner">
                    <div className="yt-stage-glow" />
                    <div className="yt-stage-content">
                      <div className="yt-stage-avatar">{appState.baby.gender === 'boy' ? '👦' : '👧'}</div>
                      <div className="yt-stage-text">
                        <div className="yt-stage-label">맞춤 추천</div>
                        <div className="yt-stage-title hand">
                          <span className="yt-stage-name">{appState.baby.name}</span>{koreanParticle(appState.baby.name,'을','를')} 위한{' '}
                          {YT_STAGE_MAP[ytAgeStage(ageInfo.months)]?.label} 영상
                        </div>
                        <div className="yt-stage-sub">{ageInfo.months}개월 · 발달에 맞는 영상부터 보여드려요</div>
                      </div>
                    </div>
                    <div className="yt-stage-tags">
                      {['먹기','놀기','자기','크기','건강하기'].map(tag => (
                        <div key={tag} className="yt-stage-tag">{tag}</div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Category Grid */}
                <div className="yt-section">
                  <div className="yt-section-row">
                    <span className="yt-section-title">카테고리</span>
                    {ageInfo && <span className="yt-section-sub">{ageInfo.months}개월 맞춤 추천순</span>}
                  </div>
                  <div className="yt-cat-grid">
                    {YT_CATS.map(cat => {
                      const stage = ageInfo ? ytAgeStage(ageInfo.months) : '4-6m';
                      const isPrimary = YT_STAGE_MAP[stage]?.primary.includes(cat.id);
                      return (
                        <button key={cat.id} className="yt-cat-card" onClick={() => ytOpenCategory(cat)}>
                          {isPrimary && <div className="yt-cat-badge">추천</div>}
                          <div className="yt-cat-icon" style={{background: cat.tone}}>{cat.emoji}</div>
                          <div className="yt-cat-label" style={{color: cat.text}}>{cat.label}</div>
                          <div className="yt-cat-desc">{cat.desc}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Representative videos per category */}
                <div className="yt-section">
                  <div className="yt-section-row">
                    <span className="yt-section-title">카테고리별 인기 영상</span>
                  </div>
                  <div className="yt-section-hint">카테고리를 클릭하면 더 많은 영상을 볼 수 있어요</div>
                </div>

                {ytRepLoading && Object.keys(ytRepVideos).length === 0 ? (
                  <div className="yt-skeleton-list">
                    {[1,2,3].map(i => <div key={i} className="yt-skeleton-card" />)}
                  </div>
                ) : (
                  <div className="yt-rep-list">
                    {YT_CATS.map(cat => {
                      const v = ytRepVideos[cat.id];
                      if (!v) return null;
                      return (
                        <div key={cat.id} className="yt-rep-item">
                          <button className="yt-rep-cat-row" onClick={() => ytOpenCategory(cat)}>
                            <div className="yt-rep-cat-left">
                              <div className="yt-rep-cat-icon" style={{background: cat.tone}}>{cat.emoji}</div>
                              <span className="yt-rep-cat-label" style={{color: cat.text}}>{cat.label}</span>
                            </div>
                            <div className="yt-rep-cat-more">
                              더보기
                              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 6l6 6-6 6"/></svg>
                            </div>
                          </button>
                          <a className="yt-video-card" href={`https://www.youtube.com/watch?v=${v.id}`} target="_blank" rel="noopener noreferrer">
                            <img className="yt-video-thumb" src={v.thumbnail} alt={v.title} loading="lazy" />
                            <div className="yt-video-info">
                              <div className="yt-video-title">{v.title}</div>
                              <div className="yt-video-meta">
                                <span>{v.channelTitle}</span>
                                {ytFmtViews(v.viewCount) && <><span> · </span><span>{ytFmtViews(v.viewCount)}</span></>}
                              </div>
                            </div>
                          </a>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            ) : ytSelectedCat ? (
              <>
                {/* Category banner */}
                <div className="yt-list-banner" style={{background: ytSelectedCat.tone}}>
                  <button className="yt-back-btn" onClick={() => { setYtView('home'); setYtSelectedCat(null); }}>
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
                  </button>
                  <div className="yt-list-banner-emoji">{ytSelectedCat.emoji}</div>
                  <div>
                    <div className="yt-list-banner-title hand" style={{color: ytSelectedCat.text}}>{ytSelectedCat.label}</div>
                    <div className="yt-list-banner-desc">{ytSelectedCat.desc}</div>
                  </div>
                </div>

                {/* Keyword chips + sort */}
                <div className="yt-keyword-wrap">
                  <div className="yt-keyword-label">키워드 선택</div>
                  <div className="yt-keyword-scroll">
                    {ytSelectedCat.queries.map(q => (
                      <button
                        key={q}
                        className={`yt-keyword-chip${ytListQuery === q ? ' active' : ''}`}
                        onClick={() => {
                          setYtListQuery(q);
                          setYtListNextPage(null);
                          ytFetchList(ytSelectedCat!, q, ytListSort);
                        }}
                      >{q}</button>
                    ))}
                  </div>
                  <div className="yt-sort-row">
                    <select
                      className="yt-sort-select"
                      value={ytListSort}
                      onChange={e => {
                        const s = e.target.value;
                        setYtListSort(s);
                        setYtListNextPage(null);
                        ytFetchList(ytSelectedCat!, ytListQuery, s);
                      }}
                    >
                      <option value="relevance">관련성순</option>
                      <option value="viewCount">조회수순</option>
                      <option value="date">최신순</option>
                      <option value="rating">평점순</option>
                    </select>
                  </div>
                </div>

                {/* Video list */}
                <div className="yt-list-videos">
                  {ytListLoading ? (
                    <div className="yt-skeleton-list">
                      {[1,2,3].map(i => <div key={i} className="yt-skeleton-full" />)}
                    </div>
                  ) : ytListVideos.length === 0 ? (
                    <div className="yt-empty">
                      <div style={{fontSize:'2.5rem',marginBottom:'8px'}}>🎬</div>
                      <div className="yt-empty-title">영상이 없어요</div>
                      <div className="yt-empty-sub">다른 키워드를 선택해보세요</div>
                    </div>
                  ) : ytListVideos.map((v, i) => (
                    <a key={v.id + i} className="yt-full-card" href={`https://www.youtube.com/watch?v=${v.id}`} target="_blank" rel="noopener noreferrer">
                      <div className="yt-full-thumb-wrap">
                        <img className="yt-full-thumb" src={v.thumbnail} alt={v.title} loading="lazy" />
                        {v.duration && <span className="yt-full-duration">{v.duration}</span>}
                      </div>
                      <div className="yt-full-info">
                        <div className="yt-full-title">{v.title}</div>
                        <div className="yt-video-meta">
                          <span>{v.channelTitle}</span>
                          {ytFmtViews(v.viewCount) && <><span> · </span><span>{ytFmtViews(v.viewCount)}</span></>}
                          {v.publishedAt && <><span> · </span><span>{ytFmtDate(v.publishedAt)}</span></>}
                        </div>
                      </div>
                    </a>
                  ))}
                  <div ref={ytSentinelRef} style={{padding:'4px'}}>
                    {ytListMoreLoading && <div className="yt-skeleton-full" style={{margin:'8px 16px'}} />}
                    {!ytListLoading && !ytListNextPage && ytListVideos.length > 0 && (
                      <div className="yt-end-msg">모든 결과를 봤어요 🌱</div>
                    )}
                  </div>
                </div>
              </>
            ) : null}

          </div>
        </section>

      </main>

      {/* Keyword Picker Overlay */}
      {kwPickerOpen && (
        <div className="kw-picker-overlay" onClick={()=>setKwPickerOpen(false)}>
          <div className="kw-picker-sheet" onClick={e=>e.stopPropagation()}>
            <div className="kw-picker-keyword">"{kwPickerKeyword}" 검색하기</div>
            <div className="kw-picker-btns">
              <a className="kw-picker-btn kw-yt" href={`https://www.youtube.com/results?search_query=${encodeURIComponent(kwPickerKeyword+' 아기')}`} target="_blank" rel="noopener noreferrer" onClick={()=>setTimeout(()=>setKwPickerOpen(false),200)}>
                🎬 <span>YouTube에서 검색</span>
              </a>
              <a className="kw-picker-btn kw-dg" href={`https://www.daangn.com/search/${encodeURIComponent(kwPickerKeyword)}`} target="_blank" rel="noopener noreferrer" onClick={()=>setTimeout(()=>setKwPickerOpen(false),200)}>
                🥕 <span>당근마켓에서 검색</span>
              </a>
              <a className="kw-picker-btn kw-mg" href={`https://momguide.co.kr/search/?q=${encodeURIComponent(kwPickerKeyword)}`} target="_blank" rel="noopener noreferrer" onClick={()=>setTimeout(()=>setKwPickerOpen(false),200)}>
                🧴 <span>맘가이드에서 검색</span>
              </a>
            </div>
            <button className="kw-picker-cancel" onClick={()=>setKwPickerOpen(false)}>취소</button>
          </div>
        </div>
      )}

      {/* Voice Overlay */}
      {voiceOverlay && (
        <div className="voice-overlay" onClick={()=>{ recognitionRef.current?.stop(); setVoiceOverlay(false); setIsRecording(false); setVoiceProcessing(false); }}>
          <div className="voice-sheet" onClick={e=>e.stopPropagation()}>
            <div className="voice-header">
              <div className="voice-icon">{voiceProcessing ? '🧠' : isRecording ? '🎙️' : '🎤'}</div>
              <div className="voice-status">{voiceProcessing ? '분석 중...' : isRecording ? '듣고 있어요...' : '음성 인식 준비 중'}</div>
            </div>
            <div className="voice-wave">
              {[1,2,3,4,5].map(i=><div key={i} className="voice-bar" style={{height:`${isRecording&&!voiceProcessing?Math.random()*32+6:6}px`}}/>)}
            </div>
            <div className="voice-transcript">{voiceTranscript || voiceProcessing ? voiceTranscript : '말씀해 주세요'}</div>
            <button className="voice-cancel" onClick={()=>{ recognitionRef.current?.stop(); setVoiceOverlay(false); setIsRecording(false); setVoiceProcessing(false); }}>취소</button>
          </div>
        </div>
      )}

      {/* Bottom Navigation — 7-col grid with center FAB mic */}
      <nav className="bottom-nav" role="navigation">
        <button className={`nav-item${currentPage==='home'?' active':''}`} onClick={()=>navigate('home')} aria-label="홈" aria-current={currentPage==='home'?'page':undefined}>
          <svg className="nav-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11l9-7 9 7v9a2 2 0 01-2 2h-4v-7H9v7H5a2 2 0 01-2-2v-9z"/></svg>
          <span className="nav-label">홈</span>
        </button>
        <button className={`nav-item${currentPage==='timeline'?' active':''}`} onClick={()=>navigate('timeline')} aria-label="시간표" aria-current={currentPage==='timeline'?'page':undefined}>
          <svg className="nav-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
          <span className="nav-label">시간표</span>
        </button>
        <button className={`nav-item${currentPage==='schedule'?' active':''}`} onClick={()=>navigate('schedule')} aria-label="스케줄" aria-current={currentPage==='schedule'?'page':undefined}>
          <svg className="nav-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 9h18M8 3v4M16 3v4"/></svg>
          <span className="nav-label">스케줄</span>
        </button>

        {/* Center FAB mic */}
        <div className="nav-center-area">
          <button className={`nav-fab-mic${isRecording?' listening':''}`} aria-label="음성 입력"
            onClick={()=>{
              const SpeechRecognition = (window as Window & { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor }).SpeechRecognition || (window as Window & { webkitSpeechRecognition?: SpeechRecognitionCtor }).webkitSpeechRecognition;
              if (!SpeechRecognition) { alert('이 브라우저는 음성 인식을 지원하지 않습니다.'); return; }
              if (isRecording) { recognitionRef.current?.stop(); setVoiceOverlay(false); setVoiceProcessing(false); return; }

              // iOS 감지 (Safari on iPhone/iPad)
              const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
                (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

              setVoiceTranscript(''); setIsRecording(true); setVoiceOverlay(true);

              let retryCount = 0;
              const MAX_RETRIES = 2;

              const startRecognition = () => {
                const recognition = new SpeechRecognition();
                recognition.lang = 'ko-KR';
                // iOS는 interimResults=true에서 불안정 → false로 고정
                recognition.interimResults = !isIOS;
                recognition.maxAlternatives = 1;

                let lastTranscript = '';

                recognition.onresult = (e: SpeechRecognitionEvent) => {
                  const transcript = Array.from(e.results).map(r => r[0].transcript).join('');
                  lastTranscript = transcript;
                  setVoiceTranscript(transcript);
                  // iOS는 onend에서 처리, 그 외는 isFinal 즉시 처리
                  if (!isIOS && e.results[e.results.length - 1].isFinal) {
                    recognitionRef.current?.stop();
                    processVoiceInput(transcript);
                  }
                };

                recognition.onerror = (e) => {
                  const errMsg = (e as { error?: string }).error;
                  // aborted: 사용자가 직접 중지한 경우 — 무시
                  if (errMsg === 'aborted') return;
                  // network 에러: 재시도 (iOS에서 가장 흔함)
                  if (errMsg === 'network' && retryCount < MAX_RETRIES) {
                    retryCount++;
                    setVoiceTranscript(`네트워크 오류, 재시도 중... (${retryCount}/${MAX_RETRIES})`);
                    setTimeout(startRecognition, 1000);
                    return;
                  }
                  // 복구 불가 에러 → 오버레이 닫기
                  setIsRecording(false); setVoiceOverlay(false); setVoiceProcessing(false);
                  if (errMsg === 'no-speech')       showToast('🎤 음성이 감지되지 않았어요. 다시 시도해주세요');
                  else if (errMsg === 'not-allowed') showToast('🎤 마이크 권한을 허용해주세요');
                  else if (errMsg === 'network')     showToast('🎤 네트워크 오류로 음성 인식에 실패했어요');
                  else if (errMsg === 'audio-capture') showToast('🎤 마이크를 사용할 수 없어요. 통화·Zoom 등 다른 앱이 마이크를 점유 중이면 종료 후 다시 시도해주세요', 5000);
                  else                               showToast(`🎤 음성 인식 오류: ${errMsg}`);
                };

                recognition.onend = () => {
                  // iOS: onresult에서 받은 마지막 텍스트로 처리
                  if (isIOS && lastTranscript) {
                    processVoiceInput(lastTranscript);
                    return;
                  }
                  if (!voiceProcessing) setIsRecording(false);
                };

                recognitionRef.current = recognition;
                recognition.start();
              };

              startRecognition();
            }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="1" width="6" height="11" rx="3"/>
              <path d="M5 10a7 7 0 0014 0M12 19v4M8 23h8"/>
            </svg>
          </button>
        </div>

        <button className={`nav-item${currentPage==='health'?' active':''}`} onClick={()=>navigate('health')} aria-label="건강" aria-current={currentPage==='health'?'page':undefined}>
          <svg className="nav-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20.8 8.6a5.5 5.5 0 00-9.3-3 5.5 5.5 0 00-9.3 3c0 6.5 9.3 11.4 9.3 11.4s9.3-4.9 9.3-11.4z"/></svg>
          <span className="nav-label">건강</span>
        </button>
        <button className={`nav-item${currentPage==='chat'?' active':''}`} onClick={()=>navigate('chat')} aria-label="챗봇" aria-current={currentPage==='chat'?'page':undefined}>
          <svg className="nav-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
          <span className="nav-label">챗봇</span>
        </button>
        <button className={`nav-item${currentPage==='info'?' active':''}`} onClick={()=>navigate('info')} aria-label="정보" aria-current={currentPage==='info'?'page':undefined}>
          <svg className="nav-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M22.54 6.42a2.78 2.78 0 00-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46A2.78 2.78 0 001.46 6.42 29 29 0 001 12a29 29 0 00.46 5.58 2.78 2.78 0 001.95 1.96C5.12 20 12 20 12 20s6.88 0 8.59-.46a2.78 2.78 0 001.95-1.96A29 29 0 0023 12a29 29 0 00-.46-5.58z"/><polygon points="9.75 15.02 15.5 12 9.75 8.98 9.75 15.02" fill="currentColor" stroke="none"/></svg>
          <span className="nav-label">정보</span>
        </button>
      </nav>

      {/* Share overlay */}
      {shareOverlay && (
        <div className="share-overlay" onClick={()=>setShareOverlay(false)}>
          <div className="share-sheet" onClick={e=>e.stopPropagation()}>
            <div className="share-sheet-title">공유하기</div>
            <div className="share-sheet-grid">
              <button className="share-opt" onClick={async()=>{
                const text=`${appState.baby?.name??'아기'} (${ageInfo?.months??0}개월) 육아 리포트`;
                await navigator.clipboard.writeText(text).catch(()=>{});
                setShareOverlay(false); showToast('📋 클립보드에 복사됐어요!');
              }}>
                <span className="share-opt-icon">📋</span>
                <span>링크 복사</span>
              </button>
              <button className="share-opt" onClick={()=>{ window.print(); setShareOverlay(false); }}>
                <span className="share-opt-icon">🖨️</span>
                <span>인쇄</span>
              </button>
            </div>
            <button className="share-cancel" onClick={()=>setShareOverlay(false)}>취소</button>
          </div>
        </div>
      )}
    </div>
  );
}
