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

type LogType = 'sleep' | 'feed' | 'pee' | 'poop' | 'cry' | 'walk';
type Page = 'home' | 'timeline' | 'schedule' | 'health' | 'chat';
type ModalState = 'setup' | 'addLog' | 'healthLog' | 'logDetail' | null;
type TodoCat = 'vaccine' | 'formula' | 'solid' | 'other';
type TodoFilter = 'all' | TodoCat;
type HealthTab = 'development' | 'logs' | 'medication';
type HealthLogType = 'temp' | 'rash' | 'symptom' | 'other';
type HealthModalMode = 'health' | 'medication';

interface Baby { name: string; birthDate: string; gender: 'boy' | 'girl'; }
interface Log {
  id: string; type: LogType; date: string; note: string;
  startTime?: string; endTime?: string; time?: string;
  amount?: number | null; feedType?: string; color?: string; reason?: string;
}
interface Todo { id: string; text: string; category: TodoCat; completed: boolean; createdAt: number; }
interface HealthLog { id: string; type: HealthLogType; detail: string; date: string; time: string; }
interface Medication { id: string; name: string; dose: string; freq: string; note: string; date: string; }
interface AppState {
  babyId: number | null;
  baby: Baby | null;
  logs: Record<string, Log[]>;
  todos: Todo[];
  health: { logs: HealthLog[]; medications: Medication[]; };
  development: Record<string, boolean>;
}
interface ChatMsg { id: string; role: 'user' | 'bot'; html: string; isTyping?: boolean; }
interface MilestoneItem { id: string; text: string; }
interface MilestoneGroup { minM: number; maxM: number; title: string; icon: string; items: MilestoneItem[]; }
interface RagChunkMeta { source: string; page?: number; }
interface RagChunk { text: string; metadata: RagChunkMeta; }
interface RagFigure { title: string; image?: string; metadata: { source: string; page?: number; }; }

// ── Constants ────────────────────────────────────────────────────
const TYPE_LABELS: Record<LogType, string> = { sleep:'수면', feed:'수유', pee:'소변', poop:'대변', cry:'울음', walk:'산책' };
const TYPE_ICONS:  Record<LogType, string> = { sleep:'😴', feed:'🍼', pee:'💧', poop:'💩', cry:'😢', walk:'🌿' };
const CAT_LABELS:  Record<TodoCat, string> = { vaccine:'예방접종', formula:'분유', solid:'이유식', other:'기타' };

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
  return { babyId:null, baby:null, logs:{}, todos:[], health:{logs:[],medications:[]}, development:{} };
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

// ── Bot helpers ──────────────────────────────────────────────────
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
    {keys:['안녕','처음','시작'],ans:'안녕하세요! 😊 저는 베이비케어 도우미예요.<br>무엇이든 편하게 물어보세요!<br><br>💡 아래 주제들을 물어보실 수 있어요:<br>💉 예방접종 일정 · 🥣 이유식 · 🍼 분유량 · 😴 수면 · 👶 발달 · 🌡️ 열 대처'},
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
  const refs: string[] = [];
  const seen = new Set<string>();
  for (const c of chunks) {
    const key = `${c.metadata.source}|${c.metadata.page}`;
    if (!seen.has(key)) {
      seen.add(key);
      const page = c.metadata.page ? ` p.${c.metadata.page}` : '';
      refs.push(`<span class="rag-ref">📖 ${escHtml(c.metadata.source)}${page}</span>`);
    }
  }
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

  // Setup form
  const [setupGender, setSetupGender] = useState<'boy' | 'girl'>('girl');
  const setupNameRef = useRef<HTMLInputElement>(null);
  const setupBirthRef = useRef<HTMLInputElement>(null);

  // Page state
  const [timelineDate, setTimelineDate] = useState(() => todayStr());
  const [todoFilter, setTodoFilter] = useState<TodoFilter>('all');
  const [todoCat, setTodoCat] = useState<TodoCat>('vaccine');
  const [healthTab, setHealthTab] = useState<HealthTab>('development');
  const todoInputRef = useRef<HTMLInputElement>(null);

  // Chat
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatBotReady, setChatBotReady] = useState(false);
  const chatMessagesRef = useRef<HTMLDivElement>(null);

  // Voice recognition
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  // OpenAI API key
  const [openAiKey, setOpenAiKey] = useState('');
  const [keyInput, setKeyInput] = useState('');

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
    const savedKey = localStorage.getItem('openai_api_key') || '';
    setOpenAiKey(savedKey);
    setKeyInput(savedKey);
    fetch('/api/state')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setAppState(Object.assign(defaultState(), data)); })
      .catch(() => {})
      .finally(() => setMounted(true));
  }, []);

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

  // ── Helpers ──────────────────────────────────────────────────
  const saveAppState = useCallback((s: AppState) => {
    setAppState(s);
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg); setToastVisible(true);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastVisible(false), 2400);
  }, []);

  // ── Navigation ────────────────────────────────────────────────
  const navigate = (page: Page) => {
    setCurrentPage(page);
    if (page === 'chat' && !chatBotReady) {
      setChatBotReady(true);
      setChatMessages([{ id: uid(), role: 'bot', html: '안녕하세요! 👋<br>베이비케어 도우미예요.<br>예방접종, 이유식, 분유량, 발달 등 궁금한 것을 무엇이든 물어보세요!' }]);
    }
  };

  // ── Log ──────────────────────────────────────────────────────
  const openAddLog = (type: LogType) => {
    const now = nowHHMM(), end = minToHM((hmToMin(now) + 60) % 1440);
    setEditingLogId(null);
    setAddLogType(type); setLfStart(now); setLfEnd(end); setLfTime(now);
    setLfAmount(''); setLfFeedType('분유'); setLfColor('노란색'); setLfReason(''); setLfNote('');
    setModal('addLog');
  };

  const saveLog = () => {
    const isEdit = !!editingLogId;
    const dateKey = isEdit ? editingLogDateKey : (currentPage === 'timeline' ? timelineDate : todayStr());
    const log: Log = { id: editingLogId || uid(), type: addLogType, date: dateKey, note: lfNote.trim() };
    if (addLogType === 'sleep' || addLogType === 'cry' || addLogType === 'walk') {
      if (!lfStart) { showToast('시작 시간을 입력해주세요'); return; }
      log.startTime = lfStart; if (lfEnd) log.endTime = lfEnd;
    } else {
      if (!lfTime) { showToast('시간을 입력해주세요'); return; }
      log.time = lfTime; log.startTime = lfTime;
    }
    if (addLogType === 'feed') { log.amount = parseInt(lfAmount||'0')||null; log.feedType = lfFeedType; }
    if (addLogType === 'poop') log.color = lfColor;
    if (addLogType === 'cry')  log.reason = lfReason;

    const ns = { ...appState };
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
    const newTodo = { id:uid(), text, category:todoCat, completed:false, createdAt:Date.now() };
    const ns = { ...appState };
    ns.todos = [newTodo, ...ns.todos];
    saveAppState(ns); if (todoInputRef.current) todoInputRef.current.value = '';
    showToast('✅ 항목이 추가됐어요!');
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

  // ── Development ──────────────────────────────────────────────
  const toggleMilestone = (id: string) => {
    const ns = { ...appState };
    ns.development = { ...ns.development, [id]: !ns.development[id] };
    saveAppState(ns); showToast(ns.development[id]?'✓ 발달 항목을 완료했어요!':'↩ 발달 항목이 취소됐어요');
    fetch(`/api/developments/${id}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ completed: ns.development[id], babyId: ns.babyId }) }).catch(console.error);
  };

  // ── Setup ────────────────────────────────────────────────────
  const handleLogout = () => {
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
    const isFirstSetup = ns.todos.length === 0;
    if (isFirstSetup) {
      ns.todos = [
        { id:uid(), text:'BCG 접종 (출생 후 4주 이내)', category:'vaccine' as const, completed:false, createdAt:Date.now() },
        { id:uid(), text:'B형간염 2차 접종 (1개월)', category:'vaccine' as const, completed:false, createdAt:Date.now() },
        { id:uid(), text:'이유식 시작 알아보기', category:'solid' as const, completed:false, createdAt:Date.now() },
      ];
      for (const todo of ns.todos) {
        await fetch('/api/todos', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ ...todo, babyId }) }).catch(console.error);
      }
    }
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
      let html: string;
      if (!openAiKey) {
        html = getBotResponse(text, months, name) + renderSources(chunks, figures);
      } else {
        const context = chunks.length
          ? chunks.map(c => { const p = c.metadata.page ? ` (p.${c.metadata.page})` : ''; return `[출처: ${c.metadata.source}${p}]\n${c.text}`; }).join('\n\n---\n\n')
          : '';
        const systemPrompt = `너는 영유아 육아 전문 챗봇이야.\n아기 이름: ${name}, 월령: ${months != null ? months + '개월' : '미입력'}.\n아래 참고 문서를 바탕으로 질문에 정확하고 실용적인 답변을 해줘.\n- 항상 한국어로 답변\n- 중요 키워드는 <strong>볼드</strong> 처리\n- 목록은 <ul><li> 형식\n- 의학적 결정은 반드시 소아청소년과 전문의 상담 권고 포함\n- 없는 정보를 지어내지 마\n\n[참고 문서]\n${context || '관련 문서 없음. 일반 육아 지식으로 답변.'}`;
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${openAiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'gpt-4o-mini', max_tokens: 800, temperature: 0.3, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: text }] }),
        });
        const data = await res.json();
        html = (data.choices?.[0]?.message?.content || '답변을 생성하지 못했어요.') + renderSources(chunks, figures);
      }
      setChatMessages(prev => [...prev.filter(m => m.id !== 'typing'), { id: uid(), role: 'bot', html }]);
    } catch {
      setChatMessages(prev => [...prev.filter(m => m.id !== 'typing'), { id: uid(), role: 'bot', html: getBotResponse(text, months, name) }]);
    }
  };

  // ── Computed ─────────────────────────────────────────────────
  const ageInfo = appState.baby ? getAgeInfo(appState.baby.birthDate) : null;
  const todayLogs = appState.logs[todayStr()] || [];
  const sleepMin = todayLogs.filter(l=>l.type==='sleep'&&l.endTime).reduce((acc,l)=>{
    let d=hmToMin(l.endTime!)-hmToMin(l.startTime!); if(d<0) d+=1440; return acc+d;
  }, 0);
  const feedCount = todayLogs.filter(l=>l.type==='feed').length;
  const diaperCount = todayLogs.filter(l=>l.type==='pee'||l.type==='poop').length;
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

  const filteredTodos = todoFilter==='all'?appState.todos:appState.todos.filter(t=>t.category===todoFilter);
  const sortedTodos = [...filteredTodos].sort((a,b)=>{
    if(a.completed!==b.completed) return a.completed?1:-1; return b.createdAt-a.createdAt;
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
    <div id="app">
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
            <div className="setup-icon">👶</div>
            <h2>베이비로그에 오신 걸<br/>환영해요!</h2>
            <p>아기 정보를 입력하고 맞춤 정보를 받아보세요</p>
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
            {(['sleep','feed','pee','poop','cry','walk'] as LogType[]).map(type=>(
              <button key={type} className={`type-tab${addLogType===type?' active':''}`} role="tab"
                onClick={()=>{setAddLogType(type); const now=nowHHMM(),end=minToHM((hmToMin(now)+60)%1440); setLfStart(now);setLfEnd(end);setLfTime(now);setLfNote('');setLfAmount('');setLfReason('');setLfColor('노란색');}}>
                {TYPE_ICONS[type]} {TYPE_LABELS[type]}
              </button>
            ))}
          </div>
          <div className="log-form-content">
            {(addLogType==='sleep'||addLogType==='cry'||addLogType==='walk') && (
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
                    <option value="분유">🍼 분유</option><option value="모유">🤱 모유</option><option value="혼합">💛 혼합</option>
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
            <div className="form-group">
              <label>메모</label>
              <div style={{position:'relative'}}>
                <textarea value={lfNote} onChange={e=>setLfNote(e.target.value)} placeholder="특이사항을 입력하세요" style={{paddingRight:'2.8rem'}} />
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

      {/* Header */}
      <header className="app-header">
        <div className="header-content">
          <div className="header-baby" role="button" tabIndex={0}
            onClick={()=>{ if(appState.baby&&setupNameRef.current) setupNameRef.current.value=appState.baby.name; if(appState.baby&&setupBirthRef.current) setupBirthRef.current.value=appState.baby.birthDate; if(appState.baby) setSetupGender(appState.baby.gender); setModal('setup'); }}
            onKeyDown={e=>{ if(e.key==='Enter'||e.key===' ') setModal('setup'); }}>
            <div className="header-avatar">{appState.baby?.gender==='boy'?'👦':'👧'}</div>
            <div>
              <div className="header-name">{appState.baby?.name||'베이비'}</div>
              <div className="header-age">
                {ageInfo ? (ageInfo.months < 1 ? `D+${ageInfo.diffDays} · ${ageInfo.weeks}주 ${ageInfo.remDays}일` : `D+${ageInfo.diffDays} · ${ageInfo.months}개월 ${ageInfo.monthRemDays}일`) : '정보 설정 필요'}
              </div>
            </div>
          </div>
          <div className="header-date" style={{whiteSpace:'pre-line'}}>{headerDate}</div>
        </div>
      </header>

      {/* Page Container */}
      <main className="page-container">

        {/* ❶ HOME */}
        <section id="page-home" className={`page${currentPage==='home'?' active':''}`}>
          <div className="page-scroll">
            <div className="section-card">
              <h3 className="section-title">오늘의 요약</h3>
              <div className="stats-grid">
                <div className="stat-item sleep-item"><div className="stat-icon">😴</div><div className="stat-value">{sleepMin===0?'—':sleepMin>=60?`${Math.floor(sleepMin/60)}h ${sleepMin%60}m`:`${sleepMin}m`}</div><div className="stat-label">수면</div></div>
                <div className="stat-item feed-item"><div className="stat-icon">🍼</div><div className="stat-value">{feedCount>0?`${feedCount}회`:'—'}</div><div className="stat-label">수유</div></div>
                <div className="stat-item diaper-item"><div className="stat-icon">🩹</div><div className="stat-value">{diaperCount>0?`${diaperCount}회`:'—'}</div><div className="stat-label">기저귀</div></div>
                <div className="stat-item walk-item"><div className="stat-icon">🌿</div><div className="stat-value">{walkCount>0?`${walkCount}회`:'—'}</div><div className="stat-label">산책</div></div>
              </div>
            </div>

            <div className="section-card">
              <h3 className="section-title">빠른 기록</h3>
              <div className="quick-grid">
                {(['sleep','feed','pee','poop','cry','walk'] as LogType[]).map(type=>(
                  <button key={type} className={`quick-btn qbtn-${type}`} onClick={()=>openAddLog(type)}>
                    <span className="quick-icon">{TYPE_ICONS[type]}</span><span>{TYPE_LABELS[type]}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="section-card">
              <div className="section-header">
                <h3 className="section-title">최근 기록</h3>
                <button className="see-all-btn" onClick={()=>navigate('timeline')}>전체보기 →</button>
              </div>
              <div className="recent-logs-list">
                {recentLogs.length===0 ? (
                  <div className="empty-state"><div className="empty-icon">📋</div><p>아직 기록이 없어요<br/>위 버튼으로 첫 기록을 남겨보세요!</p></div>
                ) : recentLogs.map(l=>{
                  let detail = TYPE_LABELS[l.type];
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
              <h3 className="section-title">오늘의 알림 🔔</h3>
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
            <span className="legend-item sleep-lg">😴 수면</span>
            <span className="legend-item feed-lg">🍼 수유</span>
            <span className="legend-item pee-lg">💧 소변</span>
            <span className="legend-item poop-lg">💩 대변</span>
            <span className="legend-item cry-lg">😢 울음</span>
            <span className="legend-item walk-lg">🌿 산책</span>
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
                  let label = TYPE_ICONS[log.type]+' '+TYPE_LABELS[log.type];
                  if(totalCols > 1) label = TYPE_ICONS[log.type]; // 좁을 땐 아이콘만
                  if(totalCols === 1) {
                    if(log.type==='feed'&&log.amount) label+=` ${log.amount}ml`;
                    if(log.type==='sleep'&&log.endTime) label+=` (${fmtDuration(log.startTime!,log.endTime)})`;
                    if(log.type==='walk'&&log.endTime) label+=` (${fmtDuration(log.startTime!,log.endTime)})`;
                  }
                  const fullLabel = (() => {
                    let l = TYPE_ICONS[log.type]+' '+TYPE_LABELS[log.type];
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
            {(['all','vaccine','formula','solid','other'] as (TodoFilter)[]).map(cat=>(
              <button key={cat} className={`cat-tab${todoFilter===cat?' active':''}`} role="tab" onClick={()=>setTodoFilter(cat)}>
                {cat==='all'?'전체':cat==='vaccine'?'💉 예방접종':cat==='formula'?'🍼 분유':cat==='solid'?'🥣 이유식':'📌 기타'}
              </button>
            ))}
          </div>
          <div className="page-scroll" style={{paddingTop:'8px'}}>
            <div className="section-card">
              <div className="todo-add-row">
                <input ref={todoInputRef} type="text" className="todo-input" placeholder="새 항목을 입력하세요..." autoComplete="off"
                  onKeyDown={e=>{ if(e.key==='Enter'){e.preventDefault();addTodo();} }} />
                <select className="todo-cat-select" value={todoCat} onChange={e=>setTodoCat(e.target.value as TodoCat)}>
                  <option value="vaccine">💉 예방</option><option value="formula">🍼 분유</option>
                  <option value="solid">🥣 이유식</option><option value="other">📌 기타</option>
                </select>
                <button className="btn-primary" onClick={addTodo}>추가</button>
              </div>
            </div>
            <div className="todo-list" role="list">
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
                      <button className="todo-ask-btn" onClick={()=>{ navigate('chat'); const q={vaccine:'예방접종 일정 알려줘',formula:'월령별 분유량 알려줘',solid:'이유식 언제 시작해요?',other:'아기 건강 정보 알려줘'}; setTimeout(()=>sendChat(q[todo.category]),300); }}>💬 챗봇에게 묻기</button>
                    </div>
                  </div>
                  <div className="todo-actions">
                    <button className="todo-delete-btn" onClick={()=>deleteTodo(todo.id)}>✕</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ❹ HEALTH */}
        <section id="page-health" className={`page${currentPage==='health'?' active':''}`} style={{display:'flex',flexDirection:'column'}}>
          <div className="h-tabs" role="tablist">
            {([['development','발달체크'],['logs','건강기록'],['medication','복약정보']] as [HealthTab,string][]).map(([tab,label])=>(
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
                    <div dangerouslySetInnerHTML={{__html: makeExtLinks(`${ageInfo.months}개월 아기 발달 장난감`)}} />
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
                <h3 className="section-title">건강 기록</h3>
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
          </div>

          {/* Medication Tab */}
          <div className={`h-section${healthTab==='medication'?' active':''} page-scroll`}>
            <div className="section-card">
              <div className="section-header">
                <h3 className="section-title">복약 정보</h3>
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
            <div className="section-card">
              <p className="info-note">💡 비대면 진료가 필요하시면 아래 서비스를 이용해보세요</p>
              <div className="telehealth-links">
                {[{icon:'🏥',name:'닥터나우',desc:'24시간 비대면 진료 서비스'},{icon:'👨‍⚕️',name:'올라케어',desc:'소아과 전문 비대면 상담'},{icon:'📱',name:'메디히어',desc:'소아청소년과 전문의 연결'}].map(({icon,name,desc})=>(
                  <div key={name} className="telehealth-card"><span className="telehealth-icon">{icon}</span><div><strong>{name}</strong><p>{desc}</p></div></div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ❺ CHAT */}
        <section id="page-chat" className={`page page-chat-layout${currentPage==='chat'?' active':''}`}>
          <div className="chat-bot-header">
            <div className="bot-avatar-lg">🤱</div>
            <div><div className="bot-name">베이비케어 도우미</div><div className="bot-status">{openAiKey ? '🤖 RAG AI 모드' : '💬 기본 답변 모드'}</div></div>
          </div>
          {!openAiKey ? (
            <div className="api-key-banner">
              <p>🔑 OpenAI API 키를 입력하면 육아 문서 기반 AI 답변을 받을 수 있어요</p>
              <div className="api-key-row">
                <input type="password" className="api-key-input" placeholder="sk-..." value={keyInput}
                  onChange={e => setKeyInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && keyInput.trim()) { localStorage.setItem('openai_api_key', keyInput.trim()); setOpenAiKey(keyInput.trim()); showToast('🔑 API 키가 저장됐어요'); }}} />
                <button className="btn-primary" style={{whiteSpace:'nowrap'}} onClick={() => { if (!keyInput.trim()) return; localStorage.setItem('openai_api_key', keyInput.trim()); setOpenAiKey(keyInput.trim()); showToast('🔑 API 키가 저장됐어요'); }}>저장</button>
              </div>
              <p style={{fontSize:'11px',color:'var(--text-light)'}}>키 없이도 기본 답변 이용 가능</p>
            </div>
          ) : (
            <div className="api-key-connected">
              <span>🤖 AI 연결됨</span>
              <button onClick={() => { localStorage.removeItem('openai_api_key'); setOpenAiKey(''); setKeyInput(''); showToast('🔑 API 키가 해제됐어요'); }}>해제</button>
            </div>
          )}
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
            {[{msg:'예방접종 일정 알려줘',label:'💉 예방접종'},{msg:'이유식 언제 시작해요?',label:'🥣 이유식'},{msg:'월령별 분유량 알려줘',label:'🍼 분유량'},{msg:'우리 아기 발달 알려줘',label:'👶 발달정보'},{msg:'수면 교육 방법 알려줘',label:'😴 수면교육'},{msg:'이 시기 추천 장난감 알려줘',label:'🎮 장난감'}].map(({msg,label})=>(
              <button key={msg} className="qr-btn" onClick={()=>sendChat(msg)}>{label}</button>
            ))}
          </div>
          <div className="chat-input-row">
            <input type="text" className="chat-input" placeholder="궁금한 것을 물어보세요..." value={chatInput}
              onChange={e=>setChatInput(e.target.value)}
              onKeyDown={e=>{ if(e.key==='Enter'){e.preventDefault();sendChat(chatInput);} }} />
            <button className="chat-send-btn" onClick={()=>sendChat(chatInput)}>↑</button>
          </div>
        </section>

      </main>

      {/* Bottom Navigation */}
      <nav className="bottom-nav" role="navigation">
        {([['home','🏠','홈'],['timeline','📅','시간표'],['schedule','✅','스케줄'],['health','❤️','건강'],['chat','💬','챗봇']] as [Page,string,string][]).map(([page,icon,label])=>(
          <button key={page} className={`nav-item${currentPage===page?' active':''}`}
            onClick={()=>navigate(page)}
            aria-label={label} aria-current={currentPage===page?'page':undefined}>
            <span className="nav-icon">{icon}</span>
            <span className="nav-label">{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
