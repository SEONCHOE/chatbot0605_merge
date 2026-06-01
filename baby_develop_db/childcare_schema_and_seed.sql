-- ================================================================
-- 육아 앱 DB 스키마 (childcare_app)
-- DBMS: SQLite 3.x / MySQL 8+ / PostgreSQL 14+ 호환
-- 작성: 2026.05.24
-- ================================================================

-- ────────────────────────────────────────────────────────────────
-- 1. 발달 단계 (stages)
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stages (
  id         VARCHAR(10)  PRIMARY KEY,        -- 'S0'~'S7'
  label      VARCHAR(50)  NOT NULL,           -- '신생아', '1~3개월' …
  sub_label  VARCHAR(30),                     -- '0~4주' (없으면 NULL)
  tip        TEXT,                            -- 이 시기 핵심 한줄 요약
  order_num  INTEGER      NOT NULL DEFAULT 0  -- 정렬 순서
);

-- ────────────────────────────────────────────────────────────────
-- 2. 카테고리 (categories)
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS categories (
  id          VARCHAR(20)  PRIMARY KEY,       -- 'eat','play','sleep','dev','health'
  label       VARCHAR(50)  NOT NULL,          -- '먹기', '놀기' …
  description VARCHAR(100),                  -- 부가 설명
  icon        VARCHAR(50),                   -- Tabler icon 이름
  order_num   INTEGER      NOT NULL DEFAULT 0
);

-- ────────────────────────────────────────────────────────────────
-- 3. 섹션 (sections) — 단계 x 카테고리 조합의 소그룹
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sections (
  id          INTEGER      PRIMARY KEY AUTOINCREMENT,
  stage_id    VARCHAR(10)  NOT NULL REFERENCES stages(id)     ON DELETE CASCADE,
  category_id VARCHAR(20)  NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  title       VARCHAR(100) NOT NULL,
  is_warning  BOOLEAN      NOT NULL DEFAULT 0,  -- 1 = 경고/주의 항목
  order_num   INTEGER      NOT NULL DEFAULT 0
);

-- ────────────────────────────────────────────────────────────────
-- 4. 섹션 항목 (section_items)
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS section_items (
  id         INTEGER  PRIMARY KEY AUTOINCREMENT,
  section_id INTEGER  NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  content    TEXT     NOT NULL,
  order_num  INTEGER  NOT NULL DEFAULT 0
);

-- ────────────────────────────────────────────────────────────────
-- 5. 이유식 그룹 (recipe_groups)
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS recipe_groups (
  id          VARCHAR(20)  PRIMARY KEY,       -- 'early','mid','late','finger'
  stage_range VARCHAR(50),                   -- '4~6개월'
  label       TEXT         NOT NULL,
  note        TEXT,                          -- 배율·제공량 등 그룹 공통 안내
  order_num   INTEGER      NOT NULL DEFAULT 0
);

-- ────────────────────────────────────────────────────────────────
-- 6. 이유식 레시피 (recipes)
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS recipes (
  id         INTEGER      PRIMARY KEY AUTOINCREMENT,
  group_id   VARCHAR(20)  NOT NULL REFERENCES recipe_groups(id) ON DELETE CASCADE,
  name       VARCHAR(100) NOT NULL,
  ingredient TEXT         NOT NULL,           -- 재료 및 분량 (한 줄 문자열)
  tip        TEXT,                            -- 조리 팁
  order_num  INTEGER      NOT NULL DEFAULT 0
);

-- ────────────────────────────────────────────────────────────────
-- 7. 조리 단계 (recipe_steps)
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS recipe_steps (
  id        INTEGER  PRIMARY KEY AUTOINCREMENT,
  recipe_id INTEGER  NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  step_num  INTEGER  NOT NULL,
  content   TEXT     NOT NULL
);

-- ────────────────────────────────────────────────────────────────
-- 8. 예방접종 (vaccines)
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vaccines (
  id          VARCHAR(20)  PRIMARY KEY,       -- 'BCG','HepB','DTaP' …
  name        VARCHAR(100) NOT NULL,
  timing      TEXT         NOT NULL,          -- 접종 시기 설명
  description VARCHAR(200),                  -- 주사 경로 등 부가 설명
  order_num   INTEGER      NOT NULL DEFAULT 0
);

-- ────────────────────────────────────────────────────────────────
-- 9. 예방접종 이상반응 (vaccine_effects)
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vaccine_effects (
  id         INTEGER      PRIMARY KEY AUTOINCREMENT,
  vaccine_id VARCHAR(20)  NOT NULL REFERENCES vaccines(id) ON DELETE CASCADE,
  -- effect_type: 'normal'(일반이상반응) | 'caution'(주의관찰) | 'emergency'(응급)
  effect_type VARCHAR(20) NOT NULL CHECK(effect_type IN ('normal','caution','emergency')),
  content    TEXT         NOT NULL,
  order_num  INTEGER      NOT NULL DEFAULT 0
);

-- ────────────────────────────────────────────────────────────────
-- 인덱스 (조회 성능)
-- ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_sections_stage_cat  ON sections(stage_id, category_id);
CREATE INDEX IF NOT EXISTS idx_section_items_sec   ON section_items(section_id);
CREATE INDEX IF NOT EXISTS idx_recipes_group       ON recipes(group_id);
CREATE INDEX IF NOT EXISTS idx_recipe_steps_recipe ON recipe_steps(recipe_id);
CREATE INDEX IF NOT EXISTS idx_vaccine_effects_vac ON vaccine_effects(vaccine_id, effect_type);

-- ────────────────────────────────────────────────────────────────
-- 유용한 뷰 (VIEW)
-- ────────────────────────────────────────────────────────────────

-- 단계+카테고리별 경고 섹션만 조회
CREATE VIEW IF NOT EXISTS v_warning_sections AS
SELECT s.id, st.label AS stage, c.label AS category,
       s.title, s.order_num
FROM   sections s
JOIN   stages     st ON s.stage_id    = st.id
JOIN   categories c  ON s.category_id = c.id
WHERE  s.is_warning = 1;

-- 레시피 전체 (그룹명 포함)
CREATE VIEW IF NOT EXISTS v_recipes_full AS
SELECT r.id, rg.label AS group_label, rg.stage_range,
       r.name, r.ingredient, r.tip, r.order_num
FROM   recipes r
JOIN   recipe_groups rg ON r.group_id = rg.id
ORDER  BY rg.order_num, r.order_num;

-- 응급 이상반응 목록
CREATE VIEW IF NOT EXISTS v_emergency_effects AS
SELECT v.name AS vaccine_name, ve.content, ve.order_num
FROM   vaccine_effects ve
JOIN   vaccines v ON ve.vaccine_id = v.id
WHERE  ve.effect_type = 'emergency'
ORDER  BY v.order_num, ve.order_num;

-- ================================================================
-- SEED DATA
-- ================================================================

-- stages
INSERT INTO stages (id,label,sub_label,tip,order_num) VALUES ('s0','신생아','0~4주','초유·원시반사·신생아 황달·BCG·B형간염 접종',1);
INSERT INTO stages (id,label,sub_label,tip,order_num) VALUES ('s1','1~3개월',NULL,'사회적 미소·쿠잉·DTaP 1-2차·영아 산통',2);
INSERT INTO stages (id,label,sub_label,tip,order_num) VALUES ('s2','4~6개월',NULL,'이유식 준비·뒤집기·DTaP 3차·수면 훈련 시작',3);
INSERT INTO stages (id,label,sub_label,tip,order_num) VALUES ('s3','7~9개월',NULL,'혼자 앉기·기기·핑거푸드·8개월 수면 회귀',4);
INSERT INTO stages (id,label,sub_label,tip,order_num) VALUES ('s4','10~12개월',NULL,'첫 걸음마·첫 단어·MMR·수두 접종',5);
INSERT INTO stages (id,label,sub_label,tip,order_num) VALUES ('s5','12~18개월',NULL,'어휘 폭발·M-CHAT 자폐 선별·단유 고려',6);
INSERT INTO stages (id,label,sub_label,tip,order_num) VALUES ('s6','19~24개월',NULL,'두 단어 조합·역할놀이·24개월 언어 점검',7);
INSERT INTO stages (id,label,sub_label,tip,order_num) VALUES ('s7','25~36개월',NULL,'문장 말하기·배변 훈련·시력·청력 검사',8);

-- categories
INSERT INTO categories (id,label,description,icon,order_num) VALUES ('eat','먹기','수유 및 이유식','droplet',1);
INSERT INTO categories (id,label,description,icon,order_num) VALUES ('play','놀기','장난감·교구·도서','puzzle',2);
INSERT INTO categories (id,label,description,icon,order_num) VALUES ('sleep','자기','수면 및 수면교육','moon',3);
INSERT INTO categories (id,label,description,icon,order_num) VALUES ('dev','발달','시기별 발달 체크','trending-up',4);
INSERT INTO categories (id,label,description,icon,order_num) VALUES ('health','건강','예방접종·응급처치','heart-rate-monitor',5);

-- sections & section_items
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (1,'s0','eat','모유수유',0,1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (1,1,'초유: 황금빛, 면역글로불린 풍부 (산후 3-5일간)',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (2,1,'수유 빈도: 2-3시간마다 (하루 8-12회)',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (3,1,'1회 수유량: 30-60ml',3);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (4,1,'수유 자세: 크래들홀드, 풋볼홀드, 눕혀서 수유',4);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (2,'s0','eat','분유수유',0,2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (5,2,'신생아 분유 (NB 단계)',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (6,2,'1회 30-60ml → 점차 증가',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (7,2,'분유병·젖꼭지 매회 멸균 필수',3);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (3,'s0','eat','주의사항',1,3);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (8,3,'출생 후 체중 5-7% 감소는 정상 범위',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (9,3,'10-14일 내 체중 회복 여부 확인',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (10,3,'황달 시에도 모유수유 지속 가능',3);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (4,'s0','play','적합 장난감',0,1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (11,4,'흑백 카드 (20-30cm 거리에서 제시)',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (12,4,'흑백·단순 패턴 모빌',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (13,4,'부드러운 딸랑이 (청각 자극)',3);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (5,'s0','play','감각 자극 놀이',0,2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (14,5,'얼굴 바라보기·눈 맞추기',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (15,5,'말 걸기·노래 부르기',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (16,5,'부드러운 신체 마사지',3);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (6,'s0','play','추천 도서·교구',0,3);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (17,6,'흑백 감각 카드 세트',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (18,6,'베이비 센서리 모빌',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (19,6,'아기 흑백 그림책 시리즈',3);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (7,'s0','sleep','수면 패턴',0,1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (20,7,'하루 총 수면: 16-17시간',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (21,7,'2-3시간마다 깨어남',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (22,7,'수면 주기: 50-60분',3);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (8,'s0','sleep','안전 수면 (SIDS 예방)',1,2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (23,8,'등을 대고 눕혀서 재우기 (엎드려 재우지 않기)',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (24,8,'단단하고 평평한 매트리스 사용',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (25,8,'침대에 베개·쿠션·인형 없이',3);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (26,8,'실내 온도 18-22°C 유지',4);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (9,'s0','sleep','수면 팁',0,3);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (27,9,'백색소음 활용',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (28,9,'스와들링(포대기 감기)',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (29,9,'낮과 밤 구분 환경 조성',3);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (10,'s0','dev','원시반사',0,1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (30,10,'탐색반사 (볼 쓰다듬으면 고개 돌림)',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (31,10,'빨기반사 · 파악반사',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (32,10,'모로반사 (깜짝 반응)',3);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (33,10,'바빈스키반사 (발바닥 자극 시 발가락 펼침)',4);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (11,'s0','dev','감각 발달',0,2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (34,11,'시력: 20-30cm 거리 인식',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (35,11,'소리·목소리 구별 반응',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (36,11,'얼굴 응시 선호',3);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (12,'s0','dev','발달 점검',1,3);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (37,12,'큰 소리에 깜짝 반응이 있는지',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (38,12,'사지 움직임이 좌우 대칭인지',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (39,12,'모로반사 비대칭 시 진찰 필요',3);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (13,'s0','health','이 시기 예방접종',0,1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (40,13,'출생 즉시: B형간염 1차',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (41,13,'4주 이내: BCG (결핵, 피내접종)',2);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (14,'s0','health','신생아 황달',1,2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (42,14,'생리적 황달: 2-3일 출현, 1-2주 소실',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (43,14,'빌리루빈 수치 주기적 확인 필수',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (44,14,'15 mg/dL 이상 → 광선치료 필요',3);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (15,'s0','health','응급 징후',1,3);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (45,15,'중앙 청색증 (입술·혀 파란색) → 즉시 응급실',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (46,15,'38°C 이상 발열 → 즉시 소아과',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (47,15,'24시간 이상 구토·설사',3);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (48,15,'무호흡 20초 이상',4);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (16,'s1','eat','모유수유',0,1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (49,16,'수유 간격 3시간으로 점차 늘어남',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (50,16,'4-6주: 모유 공급 안정화 시기',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (51,16,'젖 양 부족 시: 자주 수유·유축',3);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (17,'s1','eat','분유수유',0,2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (52,17,'1개월: 60-120ml/회, 하루 6-8회',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (53,17,'3개월: 150-180ml/회, 하루 5-6회',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (54,17,'수유 후 트림 반드시 시키기',3);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (18,'s1','eat','수유 확인',0,3);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (55,18,'기저귀 하루 6회 이상 (수분 충분 확인)',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (56,18,'체중 주 150-200g 증가 확인',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (57,18,'젖량 부족 의심 시 수유 상담',3);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (19,'s1','play','적합 장난감',0,1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (58,19,'컬러풀 모빌 (색각 발달)',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (59,19,'베이비 짐(아기 체육관)',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (60,19,'텍스처 부드러운 인형',3);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (20,'s1','play','발달 놀이',0,2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (61,20,'거울 보여주기 (자기 얼굴 인식 시작)',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (62,20,'얼굴 표정 따라하기',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (63,20,'팔·다리 움직임 보조 스트레칭',3);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (21,'s1','play','추천 도서',0,3);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (64,21,'컬러풀 보드북',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (65,21,'이 세상의 모든 아기',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (66,21,'사진 그림책 (얼굴 사진 있는 것)',3);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (22,'s1','sleep','수면 패턴',0,1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (67,22,'하루 총 수면: 14-16시간',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (68,22,'밤 수유: 2-3회',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (69,22,'낮잠: 3-4회',3);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (23,'s1','sleep','수면 의식 시작',0,2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (70,23,'목욕 → 수유 → 수면 루틴 만들기',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (71,23,'조명 어둡게·조용한 환경',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (72,23,'일정한 시간에 재우기 시도',3);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (24,'s1','sleep','주의사항',1,3);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (73,24,'뒤집기 전까지 등 대고 자기 유지',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (74,24,'수유 후 트림 시키고 재우기',2);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (25,'s1','dev','운동 발달',0,1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (75,25,'고개 가누기 시작 (터미 타임 하루 2-3회, 5-10분)',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (76,25,'손발 움직임 점점 증가',2);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (26,'s1','dev','사회·언어 발달',0,2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (77,26,'2개월: 사회적 미소 시작',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (78,26,'쿠잉(cooing) - 모음 소리 내기',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (79,26,'움직이는 물체 눈으로 추적',3);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (27,'s1','dev','2개월 발달 점검',1,3);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (80,27,'사회적 미소 없으면 소아과 평가',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (81,27,'소리에 반응 없으면 청력 검사',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (82,27,'눈으로 추적 안 되면 시력 검사',3);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (28,'s1','health','예방접종 (2개월)',0,1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (83,28,'DTaP 1차 (디프테리아·파상풍·백일해)',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (84,28,'IPV 1차 (폴리오)',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (85,28,'Hib 1차 (b형 헤모필루스 인플루엔자)',3);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (86,28,'PCV 1차 (폐렴구균)',4);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (87,28,'로타바이러스 1차',5);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (29,'s1','health','예방접종 (4개월)',0,2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (88,29,'DTaP 2차 · IPV 2차',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (89,29,'Hib 2차 · PCV 2차',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (90,29,'로타바이러스 2차',3);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (30,'s1','health','이 시기 주의',1,3);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (91,30,'영아 산통(콜릭): 하루 3시간↑, 주 3일↑, 3주 이상 지속',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (92,30,'38°C 이상 발열 → 즉시 소아과',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (93,30,'접종 후 발열·보채는 것은 정상 반응 (1-2일)',3);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (31,'s2','eat','수유 지속',0,1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (94,31,'모유 또는 분유 계속',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (95,31,'분유: 180-240ml/회, 하루 4-6회',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (96,31,'모유 수유 시 비타민D·철분 보충 고려',3);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (32,'s2','eat','이유식 시작 신호',0,2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (97,32,'목 완전히 가누기',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (98,32,'음식 보고 관심 보이기',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (99,32,'설반사 소실 (혀로 음식 밀어내지 않음)',3);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (100,32,'만 4-6개월 시작 권장',4);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (33,'s2','eat','이유식 준비물',0,3);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (101,33,'이유식 메이커 또는 믹서기',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (102,33,'납작하고 작은 실리콘 스푼',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (103,33,'이유식 그릇 및 냉동 보관 용기',3);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (104,33,'방수 앞치마·이유식 매트',4);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (34,'s2','eat','초기 이유식 원칙',0,4);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (105,34,'처음 2주: 쌀 미음만 단독 시도',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (106,34,'새 재료: 4일 간격으로 한 가지씩',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (107,34,'한 번 제공량: 30-50ml',3);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (108,34,'알레르기 반응 관찰 (발진·구토·설사)',4);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (35,'s2','play','적합 장난감',0,1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (109,35,'컬러 딸랑이·링크 장난감',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (110,35,'소프트 텍스처 볼',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (111,35,'아기 거울 장난감',3);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (36,'s2','play','발달 놀이',0,2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (112,36,'터미 타임 늘리기 (뒤집기 준비)',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (113,36,'물체 손으로 잡기 연습',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (114,36,'까꿍 놀이 시작',3);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (115,36,'목소리 흉내 내기',4);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (37,'s2','play','추천 도서',0,3);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (116,37,'동물 친구들 팝업북',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (117,37,'촉감 보드북',2);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (38,'s2','sleep','수면 패턴',0,1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (118,38,'하루 총 수면: 12-16시간',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (119,38,'밤 수면: 6-8시간 연속 가능',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (120,38,'낮잠: 3회 → 2회 전환 시기',3);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (39,'s2','sleep','수면 훈련 방법',0,2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (121,39,'퍼버법(점진적 소거법): 울도록 두고 간격 늘리며 확인',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (122,39,'무울음 수면 훈련(노 크라이): 수면 연상 바꾸기',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (123,39,'취침 루틴 일관되게 유지',3);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (40,'s2','sleep','낮잠 스케줄 예시',0,3);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (124,40,'1회: 오전 9-10시',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (125,40,'2회: 오후 12-14시',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (126,40,'3회(선택): 오후 16-17시',3);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (41,'s2','dev','운동 발달',0,1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (127,41,'4개월: 뒤집기 시작 (배→등)',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (128,41,'5개월: 양방향 뒤집기',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (129,41,'6개월: 받쳐주면 잠깐 앉기',3);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (130,41,'손으로 물건 잡기 가능',4);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (42,'s2','dev','인지·언어 발달',0,2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (131,42,'옹알이 시작 (바바·마마 등 자음+모음)',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (132,42,'이름에 반응',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (133,42,'인과관계 인식 시작',3);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (134,42,'거울 속 자기 얼굴에 관심',4);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (43,'s2','dev','4-6개월 발달 점검',1,3);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (135,43,'4개월: 소리 내기 없으면 평가',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (136,43,'6개월: 뒤집기 전혀 안 하면 상담',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (137,43,'6개월: 옹알이 없으면 청력 검사',3);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (44,'s2','health','예방접종 (6개월)',0,1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (138,44,'DTaP 3차 · IPV 3차',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (139,44,'Hib 3차 · PCV 3차',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (140,44,'로타바이러스 3차',3);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (141,44,'B형간염 3차',4);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (142,44,'인플루엔자 (6개월 이후 매년, 첫해 2회)',5);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (45,'s2','health','이 시기 건강 주의',0,2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (143,45,'이앓이 시작 (4-7개월): 침 과다·잇몸 간지러움',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (144,45,'새 식재료 추가 후 알레르기 반응 관찰 (발진·구토·설사)',2);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (46,'s2','health','고열 대처법',1,3);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (145,46,'38°C 이상: 아세트아미노펜(타이레놀) 투여 가능',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (146,46,'38.9°C 이상: 소아과 방문',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (147,46,'39.4°C 이상: 즉시 응급실',3);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (148,46,'6개월 미만 발열 → 무조건 즉시 병원',4);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (47,'s3','eat','이유식 중기 (7-8개월)',0,1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (149,47,'하루 2회 이유식',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (150,47,'으깬 형태로 입자감 추가 (7배죽, 쌀:물=1:7)',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (151,47,'새로운 식재료 계속 도전',3);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (48,'s3','eat','분유·모유',0,2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (152,48,'하루 700-800ml 유지',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (153,48,'이유식 후 부족분 수유로 보충',2);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (49,'s3','eat','핑거푸드 (8-9개월)',1,3);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (154,49,'1-2cm 이내 크기 (질식 예방)',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (155,49,'부드럽게 익힌 채소 조각·과일',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (156,49,'아기용 쌀과자·바나나 조각',3);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (157,49,'항상 보호자가 옆에서 지켜보기',4);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (50,'s3','play','적합 장난감',0,1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (158,50,'큰 쌓기 블록',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (159,50,'물 놀이 장난감',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (160,50,'끌거나 밀기 장난감',3);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (51,'s3','play','발달 놀이',0,2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (161,51,'까꿍 놀이 (대상영속성 발달)',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (162,51,'용기 속에 물건 넣고 빼기',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (163,51,'그림책 읽어주기 (하루 15분)',3);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (52,'s3','play','추천 도서',0,3);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (164,52,'배고픈 애벌레',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (165,52,'터치·사운드 북',2);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (53,'s3','sleep','수면 패턴',0,1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (166,53,'하루 총 수면: 12-15시간',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (167,53,'밤 수면: 9-10시간 연속 가능',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (168,53,'낮잠: 오전·오후 2회',3);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (54,'s3','sleep','8개월 수면 회귀',1,2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (169,54,'분리불안으로 밤에 자주 깨기 시작',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (170,54,'이전에 잘 자던 아기도 다시 깰 수 있음',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (171,54,'퇴행이 아닌 정상 발달 과정',3);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (55,'s3','sleep','대처법',0,3);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (172,55,'일관된 수면 루틴 유지 최우선',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (173,55,'달래기 최소화·스스로 잠드는 연습 지속',2);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (56,'s3','dev','운동 발달',0,1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (174,56,'7개월: 혼자 앉기 가능',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (175,56,'8개월: 기기 시작',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (176,56,'9개월: 핀서 그립 (엄지·검지로 집기)',3);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (177,56,'가구 잡고 서기 시도',4);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (57,'s3','dev','인지·사회 발달',0,2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (178,57,'낯가림 심화 (8개월 불안)',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (179,57,'대상영속성 형성 (가려도 있다는 것 앎)',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (180,57,'몸짓 의사소통 시작',3);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (181,57,'모방 행동 급증',4);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (58,'s3','dev','7-9개월 발달 점검',1,3);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (182,58,'9개월: 혼자 앉기 안 되면 상담',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (183,58,'9개월: 옹알이 없으면 청력 검사',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (184,58,'이름 불러도 전혀 반응 없으면 평가',3);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (59,'s3','health','안전사고 예방',0,1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (185,59,'낙상 주의 (침대·소파 추락)',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (186,59,'작은 물건 손에 닿지 않게',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (187,59,'계단 안전문 설치 (기기 시작 전)',3);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (60,'s3','health','영아 하임리히법',1,2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (188,60,'이물질 흡입 시: 아기 엎드려 등 두드리기 5회',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (189,60,'앙와위(눕혀서) 가슴 압박 5회 반복',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (190,60,'두 단계 반복 후에도 반응 없으면 119 신고 + 심폐소생술',3);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (61,'s3','health','이앓이 관리',0,3);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (191,61,'잇몸 마사지 (깨끗한 손가락)',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (192,61,'차가운 이앓이 링',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (193,61,'이앓이 젤은 의사 상담 후 사용',3);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (62,'s4','eat','이유식 후기 (10-12개월)',0,1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (194,62,'하루 3회 이유식 (진밥 형태, 5배죽, 쌀:물=1:5)',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (195,62,'1회 제공량: 120-180ml',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (196,62,'가족 식사와 유사한 형태 시작',3);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (197,62,'스스로 먹기 시도 격려',4);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (63,'s4','eat','금지 식품',1,2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (198,63,'생우유: 12개월 이전 금지',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (199,63,'꿀: 12개월 이전 금지 (보툴리눔 독소)',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (200,63,'통 견과류·포도·방울토마토: 질식 위험',3);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (201,63,'짠 음식·가공식품 최소화',4);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (64,'s4','eat','컵 연습',0,3);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (202,64,'빨대 컵으로 물 마시기 연습',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (203,64,'12개월 이후 젖병 떼기 시작',2);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (65,'s4','play','적합 장난감',0,1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (204,65,'장난감 악기 (실로폰·드럼)',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (205,65,'끌기·밀기 장난감',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (206,65,'소꿉놀이 세트',3);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (66,'s4','play','발달 놀이',0,2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (207,66,'블록 쌓고 무너뜨리기',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (208,66,'보드북 읽기',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (209,66,'음악에 맞춰 몸 흔들기',3);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (67,'s4','play','추천 도서',0,3);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (210,67,'곰 사냥을 떠나자',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (211,67,'팝업북 시리즈',2);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (68,'s4','sleep','수면 패턴',0,1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (212,68,'하루 총 수면: 12-14시간',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (213,68,'낮잠: 1-2회 (합계 2-3시간)',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (214,68,'밤잠: 10-12시간',3);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (69,'s4','sleep','낮잠 전환',0,2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (215,69,'2회 → 1회 낮잠으로 전환 시기',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (216,69,'이른 취침 시간으로 조정',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (217,69,'낮잠 없애면 저녁 과각성 주의',3);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (70,'s4','dev','운동 발달',0,1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (218,70,'10개월: 가구 잡고 서기',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (219,70,'11개월: 잠깐 혼자 서기',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (220,70,'12개월: 첫 걸음마 (10-14개월 정상 범위)',3);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (221,70,'손가락 세밀한 동작 발달',4);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (71,'s4','dev','언어 발달',0,2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (222,71,'첫 단어 출현 (마마·빠빠·물 등)',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (223,71,'손가락으로 원하는 것 가리키기',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (224,71,'간단한 지시 이해 ("안 돼", "줘")',3);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (72,'s4','dev','12개월 발달 점검',1,3);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (225,72,'옹알이 없으면 언어 평가',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (226,72,'가리키기(pointing) 없으면 자폐 선별 검사',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (227,72,'걸음마 15개월까지 안 하면 상담',3);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (73,'s4','health','예방접종 (12개월)',0,1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (228,73,'MMR 1차 (홍역·유행성이하선염·풍진)',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (229,73,'수두 1차',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (230,73,'A형간염 1차',3);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (231,73,'일본뇌염 1차 (사백신 기준)',4);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (232,73,'PCV 4차',5);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (74,'s4','health','안전사고 예방',0,2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (233,74,'전기 콘센트 커버 설치',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (234,74,'문 손가락 끼임 방지대',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (235,74,'목욕 시 절대 혼자 두지 않기',3);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (75,'s4','health','구강 관리',0,3);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (236,75,'이닦기 시작 (작은 칫솔 + 쌀알 크기 불소 치약)',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (237,75,'하루 2회 양치',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (238,75,'12개월 첫 치과 방문 권장',3);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (76,'s5','eat','유아식 전환',0,1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (239,76,'이유식 졸업, 세 끼 식사 시작',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (240,76,'생우유 하루 400-500ml 가능',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (241,76,'간 최소화, 자극적 음식 피하기',3);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (77,'s5','eat','단유 방법',0,2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (242,77,'WHO: 최소 24개월 모유 권장',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (243,77,'점진적 단유: 수유 횟수 서서히 줄이기',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (244,77,'낮 수유 먼저, 밤 수유 나중에 끊기',3);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (245,77,'유관 막힘 예방: 충분히 짜기',4);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (78,'s5','eat','편식 대처',0,3);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (246,78,'반복 제공 (10-15회 도전)',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (247,78,'억지로 먹이지 않기',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (248,78,'좋아하는 음식과 섞어 제공',3);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (79,'s5','play','적합 장난감',0,1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (249,79,'밀기 장난감 (워커)',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (250,79,'굵은 크레용·낙서 보드',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (251,79,'2-4피스 퍼즐',3);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (80,'s5','play','발달 놀이',0,2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (252,80,'음악에 맞춰 춤추기',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (253,80,'간단한 역할 놀이',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (254,80,'야외 놀이 (공원·모래 놀이터)',3);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (81,'s5','play','추천 도서',0,3);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (255,81,'사랑해 사랑해 사랑해',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (256,81,'으뜸 헤엄이',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (257,81,'감정 표현 그림책',3);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (82,'s5','sleep','수면 패턴',0,1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (258,82,'하루 총 수면: 11-14시간',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (259,82,'낮잠: 1회로 정착',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (260,82,'밤잠: 11-12시간',3);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (83,'s5','sleep','수면 문제',0,2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (261,83,'분리불안으로 잠들기 어려워짐',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (262,83,'밤중 깨서 부모 찾기',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (263,83,'일관된 루틴·수면 친구(인형)가 핵심',3);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (84,'s5','dev','운동 발달',0,1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (264,84,'걷기 완전히 가능',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (265,84,'빠르게 걷기·달리기 시작',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (266,84,'계단 잡고 오르기',3);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (267,84,'공 차기·던지기',4);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (85,'s5','dev','언어 발달',0,2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (268,85,'어휘 폭발기 (단어 수 급증)',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (269,85,'18개월: 단어 20개 이상',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (270,85,'두 단어 조합 시작 ("더 줘", "맘마 줘")',3);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (86,'s5','dev','18개월 M-CHAT 자폐 선별',1,3);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (271,86,'이름 부르면 돌아보는지',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (272,86,'눈 맞추기 가능한지',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (273,86,'가리키기(pointing) 하는지',3);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (274,86,'모방 행동 있는지',4);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (275,86,'18개월 단어 없으면 즉시 전문가 평가',5);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (87,'s5','health','예방접종 (18개월)',0,1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (276,87,'DTaP 4차',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (277,87,'Hib 4차',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (278,87,'A형간염 2차 (1차 접종 6개월 후)',3);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (88,'s5','health','건강 검진',0,2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (279,88,'국가 영유아 건강검진 18개월 (무료)',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (280,88,'언어·발달 평가 포함',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (281,88,'치과 검진 (6개월마다)',3);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (89,'s6','eat','유아식',0,1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (282,89,'세 끼 + 오전·오후 간식',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (283,89,'균형 식단 (단백질·채소·탄수화물)',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (284,89,'가족과 함께 식탁에서 식사',3);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (90,'s6','eat','편식 관리',0,2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (285,90,'싫어하는 음식 강요 금지',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (286,90,'다양한 조리법으로 반복 시도',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (287,90,'간식은 식사 2시간 전까지 제한',3);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (91,'s6','eat','자율 식사',0,3);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (288,91,'숟가락·포크 스스로 사용',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (289,91,'흘려도 괜찮음, 자율 식사 격려',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (290,91,'먹는 즐거움 위주로 접근',3);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (92,'s6','play','적합 장난감',0,1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (291,92,'역할 놀이 세트 (주방·병원)',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (292,92,'큰 블록 쌓기',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (293,92,'크레용·물감 색칠하기',3);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (93,'s6','play','발달 놀이',0,2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (294,93,'상상 놀이 충분히 격려',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (295,93,'또래와 병행 놀이',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (296,93,'그림책 읽기 하루 20분 이상',3);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (297,93,'노래·율동',4);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (94,'s6','play','추천 도서',0,3);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (298,94,'강아지 똥',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (299,94,'구름빵',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (300,94,'감정·일상 이야기 그림책',3);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (95,'s6','sleep','수면 패턴',0,1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (301,95,'하루 총 수면: 11-14시간',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (302,95,'낮잠: 1회',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (303,95,'밤잠: 10-12시간',3);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (96,'s6','sleep','수면 루틴',0,2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (304,96,'목욕 → 그림책 → 수면',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (305,96,'일정한 취침 시간 (오후 7-8시 권장)',2);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (97,'s6','dev','언어 발달',0,1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (306,97,'두 단어 → 세 단어 조합',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (307,97,'자기 이름 말하기',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (308,97,'간단한 질문 이해·대답',3);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (98,'s6','dev','운동 발달',0,2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (309,98,'뛰기 능숙·점프 시도',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (310,98,'공 차기·던지기',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (311,98,'계단 잡고 오르내리기',3);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (99,'s6','dev','24개월 발달 점검',1,3);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (312,99,'단어 50개 미만이면 언어 평가',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (313,99,'두 단어 조합 없으면 언어 치료 상담',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (314,99,'눈 맞추기·사회적 상호작용 확인',3);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (100,'s6','health','예방접종 (24개월)',0,1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (315,100,'A형간염 2차 (미접종 시)',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (316,100,'일본뇌염 추가접종',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (317,100,'독감 (매년)',3);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (101,'s6','health','건강 관리',0,2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (318,101,'국가 영유아 건강검진 24개월 (무료)',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (319,101,'치과 불소 도포 (6개월마다)',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (320,101,'시력·청력 이상 여부 점검',3);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (102,'s7','eat','가족 식사 완전 합류',0,1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (321,102,'가족과 동일한 음식',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (322,102,'짠 음식·가공식품·탄산음료 제한',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (323,102,'물 하루 충분히 마시기',3);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (103,'s7','eat','자율 식사',0,2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (324,103,'숟가락·포크 능숙하게 사용',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (325,103,'식사 예절 가르치기 (앉아서 먹기)',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (326,103,'식사 시간 20-30분으로 제한',3);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (104,'s7','play','적합 장난감',0,1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (327,104,'세발자전거·킥보드',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (328,104,'6-12피스 퍼즐',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (329,104,'그림 그리기 도구 (크레용·물감)',3);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (330,104,'역할 놀이 (소꿉·병원·마트)',4);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (105,'s7','play','발달 놀이',0,2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (331,105,'상상·역할 놀이 충분히',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (332,105,'또래와 함께 놀기',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (333,105,'그림책·동화 매일 읽기',3);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (334,105,'음악·춤·신체 놀이',4);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (106,'s7','play','추천 도서',0,3);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (335,106,'괴물들이 사는 나라',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (336,106,'레오 리오니 시리즈',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (337,106,'그림·이야기 결합 도서',3);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (107,'s7','sleep','수면 패턴',0,1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (338,107,'하루 총 수면: 10-13시간',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (339,107,'낮잠: 줄어들거나 없어짐 (3세경)',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (340,107,'밤잠: 10-11시간',3);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (108,'s7','sleep','수면 문제',0,2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (341,108,'악몽·야경증 시작 (정상)',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (342,108,'잠들기 거부 (독립심 발달)',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (343,108,'일관된 루틴과 정서적 안정 제공',3);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (109,'s7','dev','언어 발달',0,1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (344,109,'3-4단어 문장 사용',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (345,109,'36개월: 200-300 단어',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (346,109,'간단한 대화 가능',3);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (347,109,'이름·나이 말하기',4);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (110,'s7','dev','운동 발달',0,2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (348,110,'뛰기·점프 능숙',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (349,110,'세발자전거 타기',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (350,110,'계단 혼자 오르내리기',3);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (351,110,'공 주고받기',4);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (111,'s7','dev','자조 능력',0,3);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (352,111,'화장실 훈련 시작·완성 (개인차 큼)',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (353,111,'간단한 옷 혼자 입기',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (354,111,'손 씻기·양치 스스로',3);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (112,'s7','dev','36개월 발달 점검',1,4);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (355,112,'문장 사용 안 하면 언어 평가',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (356,112,'또래 관심 없으면 사회성 평가',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (357,112,'주의집중 어려움·과잉행동 점검',3);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (113,'s7','health','예방접종 (만 4-6세)',0,1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (358,113,'DTaP 5차 · IPV 4차 (만 4-6세)',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (359,113,'MMR 2차 (만 4-6세)',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (360,113,'일본뇌염 추가 (만 6세)',3);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (361,113,'독감 (매년)',4);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (114,'s7','health','건강 검진',0,2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (362,114,'국가 영유아 건강검진 30·36개월 (무료)',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (363,114,'시력 검사 (사시·약시 조기 발견)',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (364,114,'청력 검사',3);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (365,114,'치과 검진 (6개월마다)',4);
INSERT INTO sections (id,stage_id,category_id,title,is_warning,order_num) VALUES (115,'s7','health','배변 훈련 신호',0,3);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (366,115,'기저귀 젖어도 말로 알려줌',1);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (367,115,'2시간 이상 건조 유지',2);
INSERT INTO section_items (id,section_id,content,order_num) VALUES (368,115,'낮 배변 먼저, 밤 배변은 나중',3);

-- recipe_groups, recipes, recipe_steps
INSERT INTO recipe_groups (id,stage_range,label,note,order_num) VALUES ('early','4~6개월','초기 이유식 — 미음 형태 (10배죽)','쌀 : 물 = 1 : 10 / 1회 제공량 30-50ml / 새 재료는 4일 간격으로 한 가지씩',1);
INSERT INTO recipes (id,group_id,name,ingredient,tip,order_num) VALUES (1,'early','기본 쌀 미음','불린 쌀 15g + 물 150ml','처음 1-2주는 쌀 미음만 단독으로 시도',1);
INSERT INTO recipe_steps (id,recipe_id,step_num,content) VALUES (1,1,1,'쌀을 30분 이상 물에 불린다');
INSERT INTO recipe_steps (id,recipe_id,step_num,content) VALUES (2,1,2,'믹서에 쌀과 물을 넣고 곱게 간다');
INSERT INTO recipe_steps (id,recipe_id,step_num,content) VALUES (3,1,3,'냄비에 넣고 약불에서 10분 저으며 끓인다');
INSERT INTO recipe_steps (id,recipe_id,step_num,content) VALUES (4,1,4,'체에 한 번 걸러 부드럽게 만든다');
INSERT INTO recipes (id,group_id,name,ingredient,tip,order_num) VALUES (2,'early','단호박 미음','불린 쌀 15g + 단호박 30g + 물 150ml','단호박의 단맛으로 아기가 잘 받아들이는 편',2);
INSERT INTO recipe_steps (id,recipe_id,step_num,content) VALUES (5,2,1,'단호박은 껍질·씨 제거 후 찜기에 10분 찐다');
INSERT INTO recipe_steps (id,recipe_id,step_num,content) VALUES (6,2,2,'쌀과 단호박, 물을 함께 믹서에 간다');
INSERT INTO recipe_steps (id,recipe_id,step_num,content) VALUES (7,2,3,'약불에서 8-10분 저으며 끓인다');
INSERT INTO recipes (id,group_id,name,ingredient,tip,order_num) VALUES (3,'early','고구마 미음','불린 쌀 15g + 고구마 30g + 물 150ml','섬유질 풍부, 변비 예방에 도움',3);
INSERT INTO recipe_steps (id,recipe_id,step_num,content) VALUES (8,3,1,'고구마는 껍질 제거 후 찜기에 15분 찐다');
INSERT INTO recipe_steps (id,recipe_id,step_num,content) VALUES (9,3,2,'쌀, 고구마, 물 함께 믹서에 간다');
INSERT INTO recipe_steps (id,recipe_id,step_num,content) VALUES (10,3,3,'약불에서 8-10분 저으며 끓인다');
INSERT INTO recipes (id,group_id,name,ingredient,tip,order_num) VALUES (4,'early','브로콜리 미음','불린 쌀 15g + 브로콜리 20g + 물 150ml','비타민C·철분 풍부, 꽃 부분만 사용',4);
INSERT INTO recipe_steps (id,recipe_id,step_num,content) VALUES (11,4,1,'브로콜리 꽃 부분만 분리해 끓는 물에 5분 데친다');
INSERT INTO recipe_steps (id,recipe_id,step_num,content) VALUES (12,4,2,'쌀, 브로콜리, 물 함께 믹서에 간다');
INSERT INTO recipe_steps (id,recipe_id,step_num,content) VALUES (13,4,3,'약불에서 10분 저으며 끓인 후 체에 거른다');
INSERT INTO recipes (id,group_id,name,ingredient,tip,order_num) VALUES (5,'early','완두콩 미음','불린 쌀 15g + 완두콩(냉동) 20g + 물 150ml','식물성 단백질 보충, 4개월 이후 시도',5);
INSERT INTO recipe_steps (id,recipe_id,step_num,content) VALUES (14,5,1,'냉동 완두콩을 끓는 물에 5분 데친다');
INSERT INTO recipe_steps (id,recipe_id,step_num,content) VALUES (15,5,2,'껍질 제거 후 쌀, 물과 함께 믹서에 간다');
INSERT INTO recipe_steps (id,recipe_id,step_num,content) VALUES (16,5,3,'약불에서 10분 저으며 끓인 후 체에 거른다');
INSERT INTO recipe_groups (id,stage_range,label,note,order_num) VALUES ('mid','7~9개월','중기 이유식 — 죽 형태 (7배죽), 으깬 입자 포함','쌀 : 물 = 1 : 7 / 1회 제공량 80-120ml / 하루 2회 / 소고기·닭고기 적극 도입',2);
INSERT INTO recipes (id,group_id,name,ingredient,tip,order_num) VALUES (6,'mid','소고기 애호박죽','불린 쌀 30g + 소고기(다짐육) 20g + 애호박 20g + 물 210ml','소고기는 철분 보충에 필수, 주 3-4회 권장',1);
INSERT INTO recipe_steps (id,recipe_id,step_num,content) VALUES (17,6,1,'소고기는 찬물에 10분 담가 핏물 제거');
INSERT INTO recipe_steps (id,recipe_id,step_num,content) VALUES (18,6,2,'애호박은 껍질 제거 후 잘게 다진다');
INSERT INTO recipe_steps (id,recipe_id,step_num,content) VALUES (19,6,3,'소고기, 애호박을 각각 볶다가 쌀, 물 넣어 끓인다');
INSERT INTO recipe_steps (id,recipe_id,step_num,content) VALUES (20,6,4,'약불에서 15분 저으며 죽 농도로 끓임');
INSERT INTO recipes (id,group_id,name,ingredient,tip,order_num) VALUES (7,'mid','닭고기 당근죽','불린 쌀 30g + 닭가슴살 20g + 당근 15g + 물 210ml','닭가슴살은 지방이 적어 소화 잘됨',2);
INSERT INTO recipe_steps (id,recipe_id,step_num,content) VALUES (21,7,1,'닭가슴살은 끓는 물에 10분 삶아 잘게 찢는다');
INSERT INTO recipe_steps (id,recipe_id,step_num,content) VALUES (22,7,2,'당근은 잘게 다진다');
INSERT INTO recipe_steps (id,recipe_id,step_num,content) VALUES (23,7,3,'쌀, 닭고기, 당근, 물을 냄비에 넣고 끓인다');
INSERT INTO recipe_steps (id,recipe_id,step_num,content) VALUES (24,7,4,'중약불에서 15분 저으며 죽 농도로 끓임');
INSERT INTO recipes (id,group_id,name,ingredient,tip,order_num) VALUES (8,'mid','두부 시금치죽','불린 쌀 30g + 두부 30g + 시금치 15g + 물 210ml','식물성 단백질·철분 보충, 시금치는 잎만 사용',3);
INSERT INTO recipe_steps (id,recipe_id,step_num,content) VALUES (25,8,1,'두부는 끓는 물에 데쳐 잘게 으깬다');
INSERT INTO recipe_steps (id,recipe_id,step_num,content) VALUES (26,8,2,'시금치는 잎 부분만 끓는 물에 데쳐 잘게 다진다');
INSERT INTO recipe_steps (id,recipe_id,step_num,content) VALUES (27,8,3,'쌀, 두부, 시금치, 물 넣고 약불에서 15분 끓인다');
INSERT INTO recipes (id,group_id,name,ingredient,tip,order_num) VALUES (9,'mid','연어 감자죽','불린 쌀 30g + 연어 20g + 감자 20g + 물 210ml','DHA 풍부, 처음 도입 시 소량으로 알레르기 확인',4);
INSERT INTO recipe_steps (id,recipe_id,step_num,content) VALUES (28,9,1,'연어는 가시 제거 후 찜기에 8분 쪄 잘게 으깬다');
INSERT INTO recipe_steps (id,recipe_id,step_num,content) VALUES (29,9,2,'감자는 삶아서 으깬다');
INSERT INTO recipe_steps (id,recipe_id,step_num,content) VALUES (30,9,3,'쌀, 연어, 감자, 물 넣고 약불에서 15분 끓인다');
INSERT INTO recipes (id,group_id,name,ingredient,tip,order_num) VALUES (10,'mid','달걀 노른자죽','불린 쌀 30g + 달걀 노른자 1개 + 물 210ml','흰자는 알레르기 위험, 노른자만 먼저 시도 (7-8개월)',5);
INSERT INTO recipe_steps (id,recipe_id,step_num,content) VALUES (31,10,1,'달걀을 완숙으로 삶아 노른자만 분리한다');
INSERT INTO recipe_steps (id,recipe_id,step_num,content) VALUES (32,10,2,'노른자를 곱게 으깬다');
INSERT INTO recipe_steps (id,recipe_id,step_num,content) VALUES (33,10,3,'쌀, 물로 기본 죽을 끓인 후 노른자 넣어 섞는다');
INSERT INTO recipe_groups (id,stage_range,label,note,order_num) VALUES ('late','10~12개월','후기 이유식 — 진밥 형태 (5배죽), 입자 굵게','쌀 : 물 = 1 : 5 / 1회 제공량 120-180ml / 하루 3회 / 가족 식사와 유사 형태',3);
INSERT INTO recipes (id,group_id,name,ingredient,tip,order_num) VALUES (11,'late','소고기 채소 진밥','불린 쌀 40g + 소고기(다짐육) 25g + 당근 15g + 애호박 15g + 물 200ml','이 시기부터 입자를 씹는 연습이 중요',1);
INSERT INTO recipe_steps (id,recipe_id,step_num,content) VALUES (34,11,1,'소고기 핏물 제거 후 잘게 다진다');
INSERT INTO recipe_steps (id,recipe_id,step_num,content) VALUES (35,11,2,'당근, 애호박은 3-5mm 크기로 다진다');
INSERT INTO recipe_steps (id,recipe_id,step_num,content) VALUES (36,11,3,'냄비에 소고기 먼저 볶다가 채소, 쌀, 물 넣는다');
INSERT INTO recipe_steps (id,recipe_id,step_num,content) VALUES (37,11,4,'중약불에서 20분 저으며 진밥 농도로 끓임');
INSERT INTO recipes (id,group_id,name,ingredient,tip,order_num) VALUES (12,'late','달걀 야채 진밥','불린 쌀 40g + 달걀 1개 + 양파 10g + 당근 10g + 물 200ml','달걀 흰자 도입 가능 (알레르기 확인 필수)',2);
INSERT INTO recipe_steps (id,recipe_id,step_num,content) VALUES (38,12,1,'달걀은 완숙으로 잘게 다진다');
INSERT INTO recipe_steps (id,recipe_id,step_num,content) VALUES (39,12,2,'양파·당근은 3-5mm로 다져 볶는다');
INSERT INTO recipe_steps (id,recipe_id,step_num,content) VALUES (40,12,3,'쌀, 채소, 물 넣고 15분 끓인 후 달걀 넣어 5분 더 끓임');
INSERT INTO recipes (id,group_id,name,ingredient,tip,order_num) VALUES (13,'late','닭고기 브로콜리 진밥','불린 쌀 40g + 닭가슴살 25g + 브로콜리 20g + 물 200ml','부드러운 씹기 연습에 좋음',3);
INSERT INTO recipe_steps (id,recipe_id,step_num,content) VALUES (41,13,1,'닭가슴살 삶아서 3-5mm로 다진다');
INSERT INTO recipe_steps (id,recipe_id,step_num,content) VALUES (42,13,2,'브로콜리 데쳐 잘게 다진다');
INSERT INTO recipe_steps (id,recipe_id,step_num,content) VALUES (43,13,3,'쌀, 닭고기, 브로콜리, 물 넣고 20분 끓인다');
INSERT INTO recipes (id,group_id,name,ingredient,tip,order_num) VALUES (14,'late','두부 미역 진밥','불린 쌀 40g + 두부 30g + 불린 미역 10g + 참기름 0.5ml + 물 200ml','미역은 요오드·칼슘 풍부, 이 시기부터 소량 도입',4);
INSERT INTO recipe_steps (id,recipe_id,step_num,content) VALUES (44,14,1,'미역은 짧게 불려 잘게 다진다');
INSERT INTO recipe_steps (id,recipe_id,step_num,content) VALUES (45,14,2,'두부는 끓는 물에 데쳐 으깬다');
INSERT INTO recipe_steps (id,recipe_id,step_num,content) VALUES (46,14,3,'쌀, 미역, 물 끓이다가 두부 넣고 15분 더 끓임');
INSERT INTO recipe_steps (id,recipe_id,step_num,content) VALUES (47,14,4,'완성 후 참기름 한 방울 추가');
INSERT INTO recipes (id,group_id,name,ingredient,tip,order_num) VALUES (15,'late','흰살생선 감자 진밥','불린 쌀 40g + 대구살(또는 명태) 25g + 감자 20g + 물 200ml','흰살 생선은 단백질·DHA 풍부, 가시 제거 철저히',5);
INSERT INTO recipe_steps (id,recipe_id,step_num,content) VALUES (48,15,1,'생선은 찜기에 8분 쪄 가시 완전히 제거 후 으깬다');
INSERT INTO recipe_steps (id,recipe_id,step_num,content) VALUES (49,15,2,'감자는 삶아 5mm 크기로 자른다');
INSERT INTO recipe_steps (id,recipe_id,step_num,content) VALUES (50,15,3,'쌀, 생선, 감자, 물 넣고 20분 끓인다');
INSERT INTO recipe_groups (id,stage_range,label,note,order_num) VALUES ('finger','8~12개월','핑거푸드 — 손으로 집어 먹기','크기: 1-2cm 이내 / 반드시 부드럽게 익혀서 / 항상 보호자가 옆에서 지켜볼 것',4);
INSERT INTO recipes (id,group_id,name,ingredient,tip,order_num) VALUES (16,'finger','연두부 조각','연두부 50g','가장 부드러운 핑거푸드 입문용',1);
INSERT INTO recipe_steps (id,recipe_id,step_num,content) VALUES (51,16,1,'연두부를 1-1.5cm 크기로 잘라 그대로 제공');
INSERT INTO recipes (id,group_id,name,ingredient,tip,order_num) VALUES (17,'finger','당근 스틱','당근 적당량','단단하게 익히면 질식 위험, 반드시 손가락으로 으깨질 정도로',2);
INSERT INTO recipe_steps (id,recipe_id,step_num,content) VALUES (52,17,1,'당근을 손가락 크기로 자른다');
INSERT INTO recipe_steps (id,recipe_id,step_num,content) VALUES (53,17,2,'끓는 물에 10-15분 푹 삶아 완전히 물러야 안전');
INSERT INTO recipes (id,group_id,name,ingredient,tip,order_num) VALUES (18,'finger','바나나 조각','바나나 1/3개','가장 접하기 쉬운 핑거푸드, 에너지원',3);
INSERT INTO recipe_steps (id,recipe_id,step_num,content) VALUES (54,18,1,'바나나를 1-2cm 크기로 잘라 제공');
INSERT INTO recipes (id,group_id,name,ingredient,tip,order_num) VALUES (19,'finger','찐 고구마 조각','고구마 1/2개','달콤해서 아기가 좋아함, 섬유질 풍부',4);
INSERT INTO recipe_steps (id,recipe_id,step_num,content) VALUES (55,19,1,'고구마 껍질 제거 후 1-2cm 크기로 자른다');
INSERT INTO recipe_steps (id,recipe_id,step_num,content) VALUES (56,19,2,'찜기에 15분 이상 푹 찐다');
INSERT INTO recipes (id,group_id,name,ingredient,tip,order_num) VALUES (20,'finger','완숙 달걀 조각','달걀 1개','흰자 알레르기 확인 후 제공 (10개월 이후 권장)',5);
INSERT INTO recipe_steps (id,recipe_id,step_num,content) VALUES (57,20,1,'달걀을 12분 완숙으로 삶는다');
INSERT INTO recipe_steps (id,recipe_id,step_num,content) VALUES (58,20,2,'껍질 제거 후 1-2cm 크기로 자른다');

-- vaccines & vaccine_effects
INSERT INTO vaccines (id,name,timing,description,order_num) VALUES ('BCG','BCG (결핵)','출생 후 4주 이내','피내접종, 왼쪽 상완',1);
INSERT INTO vaccine_effects (id,vaccine_id,effect_type,content,order_num) VALUES (1,'BCG','normal','접종 후 2-4주: 붉은 구진 형성',1);
INSERT INTO vaccine_effects (id,vaccine_id,effect_type,content,order_num) VALUES (2,'BCG','normal','4-8주: 화농성 결절 → 딱지 형성',2);
INSERT INTO vaccine_effects (id,vaccine_id,effect_type,content,order_num) VALUES (3,'BCG','normal','3개월 내 자연 소실 (3-5mm 반흔 남음)',3);
INSERT INTO vaccine_effects (id,vaccine_id,effect_type,content,order_num) VALUES (4,'BCG','normal','해당 림프절 부어오를 수 있음 (10mm 이내 정상)',4);
INSERT INTO vaccine_effects (id,vaccine_id,effect_type,content,order_num) VALUES (5,'BCG','caution','10mm 이상 림프절 종창 → 소아과 방문',1);
INSERT INTO vaccine_effects (id,vaccine_id,effect_type,content,order_num) VALUES (6,'BCG','caution','화농성 림프절염 → 의사 상담 필요',2);
INSERT INTO vaccine_effects (id,vaccine_id,effect_type,content,order_num) VALUES (7,'BCG','caution','접종 부위 임의로 짜거나 소독하지 말 것',3);
INSERT INTO vaccines (id,name,timing,description,order_num) VALUES ('HepB','B형간염','출생 즉시 / 1개월 / 6개월 (총 3회)','근육주사',2);
INSERT INTO vaccine_effects (id,vaccine_id,effect_type,content,order_num) VALUES (8,'HepB','normal','접종 부위 발적·부종 (24-48시간)',1);
INSERT INTO vaccine_effects (id,vaccine_id,effect_type,content,order_num) VALUES (9,'HepB','normal','접종 부위 통증·압통',2);
INSERT INTO vaccine_effects (id,vaccine_id,effect_type,content,order_num) VALUES (10,'HepB','normal','미열 (38°C 미만)',3);
INSERT INTO vaccine_effects (id,vaccine_id,effect_type,content,order_num) VALUES (11,'HepB','caution','발적이 7일 이상 지속 시 상담',1);
INSERT INTO vaccine_effects (id,vaccine_id,effect_type,content,order_num) VALUES (12,'HepB','emergency','호흡곤란·두드러기·혈압저하 → 즉시 응급실 (아나필락시스)',1);
INSERT INTO vaccines (id,name,timing,description,order_num) VALUES ('DTaP','DTaP (디프테리아·파상풍·백일해)','2·4·6개월 / 15-18개월 / 만 4-6세 (총 5회)','근육주사',3);
INSERT INTO vaccine_effects (id,vaccine_id,effect_type,content,order_num) VALUES (13,'DTaP','normal','접종 부위 발적·부종·통증 (24-48시간)',1);
INSERT INTO vaccine_effects (id,vaccine_id,effect_type,content,order_num) VALUES (14,'DTaP','normal','발열 38-39°C (1-2일 내 소실)',2);
INSERT INTO vaccine_effects (id,vaccine_id,effect_type,content,order_num) VALUES (15,'DTaP','normal','보채기·식욕 저하·졸림',3);
INSERT INTO vaccine_effects (id,vaccine_id,effect_type,content,order_num) VALUES (16,'DTaP','caution','접종 부위 직경 5cm 이상 부종 → 상담',1);
INSERT INTO vaccine_effects (id,vaccine_id,effect_type,content,order_num) VALUES (17,'DTaP','caution','39°C 이상 발열 → 소아과 방문',2);
INSERT INTO vaccine_effects (id,vaccine_id,effect_type,content,order_num) VALUES (18,'DTaP','caution','48시간 이상 지속 보채기 → 상담',3);
INSERT INTO vaccine_effects (id,vaccine_id,effect_type,content,order_num) VALUES (19,'DTaP','emergency','경련 (발열성 경련 포함) → 즉시 응급실',1);
INSERT INTO vaccine_effects (id,vaccine_id,effect_type,content,order_num) VALUES (20,'DTaP','emergency','의식 변화·극심한 보채기 → 즉시 응급실',2);
INSERT INTO vaccine_effects (id,vaccine_id,effect_type,content,order_num) VALUES (21,'DTaP','emergency','아나필락시스 증상 → 즉시 응급실',3);
INSERT INTO vaccines (id,name,timing,description,order_num) VALUES ('IPV','IPV (폴리오)','2·4·6개월 / 만 4-6세 (총 4회)','근육주사 또는 피하주사',4);
INSERT INTO vaccine_effects (id,vaccine_id,effect_type,content,order_num) VALUES (22,'IPV','normal','접종 부위 통증·발적·부종',1);
INSERT INTO vaccine_effects (id,vaccine_id,effect_type,content,order_num) VALUES (23,'IPV','normal','미열',2);
INSERT INTO vaccine_effects (id,vaccine_id,effect_type,content,order_num) VALUES (24,'IPV','caution','부종이 심하면 상담',1);
INSERT INTO vaccine_effects (id,vaccine_id,effect_type,content,order_num) VALUES (25,'IPV','emergency','아나필락시스 증상 → 즉시 응급실',1);
INSERT INTO vaccines (id,name,timing,description,order_num) VALUES ('Hib','Hib (b형 헤모필루스 인플루엔자)','2·4·6개월 / 12-15개월 (총 4회)','근육주사',5);
INSERT INTO vaccine_effects (id,vaccine_id,effect_type,content,order_num) VALUES (26,'Hib','normal','접종 부위 발적·부종·통증 (12-24시간)',1);
INSERT INTO vaccine_effects (id,vaccine_id,effect_type,content,order_num) VALUES (27,'Hib','normal','미열 (38°C 미만)',2);
INSERT INTO vaccine_effects (id,vaccine_id,effect_type,content,order_num) VALUES (28,'Hib','normal','보채기',3);
INSERT INTO vaccine_effects (id,vaccine_id,effect_type,content,order_num) VALUES (29,'Hib','caution','38°C 이상 발열 지속 시 상담',1);
INSERT INTO vaccine_effects (id,vaccine_id,effect_type,content,order_num) VALUES (30,'Hib','emergency','아나필락시스 증상 → 즉시 응급실',1);
INSERT INTO vaccines (id,name,timing,description,order_num) VALUES ('PCV','PCV (폐렴구균)','2·4·6개월 / 12-15개월 (총 4회)','근육주사',6);
INSERT INTO vaccine_effects (id,vaccine_id,effect_type,content,order_num) VALUES (31,'PCV','normal','접종 부위 발적·부종·통증 (24-48시간)',1);
INSERT INTO vaccine_effects (id,vaccine_id,effect_type,content,order_num) VALUES (32,'PCV','normal','발열 38-39°C (DTaP 동시 접종 시 높아질 수 있음)',2);
INSERT INTO vaccine_effects (id,vaccine_id,effect_type,content,order_num) VALUES (33,'PCV','normal','식욕 감소·보채기·졸림',3);
INSERT INTO vaccine_effects (id,vaccine_id,effect_type,content,order_num) VALUES (34,'PCV','caution','39°C 이상 발열 → 소아과 방문',1);
INSERT INTO vaccine_effects (id,vaccine_id,effect_type,content,order_num) VALUES (35,'PCV','caution','접종 부위 직경 7cm 이상 부종 → 상담',2);
INSERT INTO vaccine_effects (id,vaccine_id,effect_type,content,order_num) VALUES (36,'PCV','emergency','아나필락시스 증상 → 즉시 응급실',1);
INSERT INTO vaccines (id,name,timing,description,order_num) VALUES ('Rota','로타바이러스','2·4개월 (2가 백신) / 2·4·6개월 (5가 백신)','경구 투여 (먹는 백신)',7);
INSERT INTO vaccine_effects (id,vaccine_id,effect_type,content,order_num) VALUES (37,'Rota','normal','구토 (접종 후 수일 내)',1);
INSERT INTO vaccine_effects (id,vaccine_id,effect_type,content,order_num) VALUES (38,'Rota','normal','설사 (묽은 변)',2);
INSERT INTO vaccine_effects (id,vaccine_id,effect_type,content,order_num) VALUES (39,'Rota','normal','보채기·식욕 감소·미열',3);
INSERT INTO vaccine_effects (id,vaccine_id,effect_type,content,order_num) VALUES (40,'Rota','caution','설사·구토가 2일 이상 지속 → 상담',1);
INSERT INTO vaccine_effects (id,vaccine_id,effect_type,content,order_num) VALUES (41,'Rota','caution','혈변 발생 시 → 즉시 소아과 (장중첩증 의심)',2);
INSERT INTO vaccine_effects (id,vaccine_id,effect_type,content,order_num) VALUES (42,'Rota','emergency','심한 복통·혈변·구토 반복 → 즉시 응급실 (장중첩증)',1);
INSERT INTO vaccines (id,name,timing,description,order_num) VALUES ('MMR','MMR (홍역·유행성이하선염·풍진)','12-15개월 / 만 4-6세 (총 2회)','피하주사',8);
INSERT INTO vaccine_effects (id,vaccine_id,effect_type,content,order_num) VALUES (43,'MMR','normal','접종 7-12일 후 발열 (38-39°C, 1-5일)',1);
INSERT INTO vaccine_effects (id,vaccine_id,effect_type,content,order_num) VALUES (44,'MMR','normal','접종 7-10일 후 희미한 발진 (홍역 유사, 2-3일)',2);
INSERT INTO vaccine_effects (id,vaccine_id,effect_type,content,order_num) VALUES (45,'MMR','normal','귀밑 림프절·침샘 가볍게 부음 (접종 2-3주 후)',3);
INSERT INTO vaccine_effects (id,vaccine_id,effect_type,content,order_num) VALUES (46,'MMR','normal','열성 경련 (드물게, 발열성)',4);
INSERT INTO vaccine_effects (id,vaccine_id,effect_type,content,order_num) VALUES (47,'MMR','caution','발진이 7일 이상 지속 → 상담',1);
INSERT INTO vaccine_effects (id,vaccine_id,effect_type,content,order_num) VALUES (48,'MMR','caution','고열 (40°C 이상) → 소아과 방문',2);
INSERT INTO vaccine_effects (id,vaccine_id,effect_type,content,order_num) VALUES (49,'MMR','emergency','경련 동반 의식 소실 → 즉시 응급실',1);
INSERT INTO vaccine_effects (id,vaccine_id,effect_type,content,order_num) VALUES (50,'MMR','emergency','아나필락시스 증상 → 즉시 응급실',2);
INSERT INTO vaccines (id,name,timing,description,order_num) VALUES ('Varicella','수두','12-15개월 (1회)','피하주사',9);
INSERT INTO vaccine_effects (id,vaccine_id,effect_type,content,order_num) VALUES (51,'Varicella','normal','접종 부위 발적·부종',1);
INSERT INTO vaccine_effects (id,vaccine_id,effect_type,content,order_num) VALUES (52,'Varicella','normal','접종 7-21일 후 가벼운 수두 유사 발진 (수포 5개 미만)',2);
INSERT INTO vaccine_effects (id,vaccine_id,effect_type,content,order_num) VALUES (53,'Varicella','normal','미열',3);
INSERT INTO vaccine_effects (id,vaccine_id,effect_type,content,order_num) VALUES (54,'Varicella','caution','발진이 전신으로 퍼질 경우 상담',1);
INSERT INTO vaccine_effects (id,vaccine_id,effect_type,content,order_num) VALUES (55,'Varicella','caution','면역저하 가족원 있으면 사전에 의사 상담',2);
INSERT INTO vaccine_effects (id,vaccine_id,effect_type,content,order_num) VALUES (56,'Varicella','emergency','아나필락시스 증상 → 즉시 응급실',1);
INSERT INTO vaccines (id,name,timing,description,order_num) VALUES ('HepA','A형간염','12개월 이후 1차 / 6개월 후 2차 (총 2회)','근육주사',10);
INSERT INTO vaccine_effects (id,vaccine_id,effect_type,content,order_num) VALUES (57,'HepA','normal','접종 부위 통증·발적·부종 (24-48시간)',1);
INSERT INTO vaccine_effects (id,vaccine_id,effect_type,content,order_num) VALUES (58,'HepA','normal','두통·피로감',2);
INSERT INTO vaccine_effects (id,vaccine_id,effect_type,content,order_num) VALUES (59,'HepA','normal','미열',3);
INSERT INTO vaccine_effects (id,vaccine_id,effect_type,content,order_num) VALUES (60,'HepA','caution','심한 구토·복통 지속 시 상담',1);
INSERT INTO vaccine_effects (id,vaccine_id,effect_type,content,order_num) VALUES (61,'HepA','emergency','아나필락시스 증상 → 즉시 응급실',1);
INSERT INTO vaccines (id,name,timing,description,order_num) VALUES ('JE','일본뇌염 (사백신)','12·13개월 / 24개월 / 만 6세 / 만 12세 (총 5회)','피하주사',11);
INSERT INTO vaccine_effects (id,vaccine_id,effect_type,content,order_num) VALUES (62,'JE','normal','접종 부위 발적·부종·통증',1);
INSERT INTO vaccine_effects (id,vaccine_id,effect_type,content,order_num) VALUES (63,'JE','normal','발열 (38°C 미만)',2);
INSERT INTO vaccine_effects (id,vaccine_id,effect_type,content,order_num) VALUES (64,'JE','normal','두통·근육통',3);
INSERT INTO vaccine_effects (id,vaccine_id,effect_type,content,order_num) VALUES (65,'JE','caution','39°C 이상 발열 지속 → 소아과 방문',1);
INSERT INTO vaccine_effects (id,vaccine_id,effect_type,content,order_num) VALUES (66,'JE','emergency','신경계 증상 (경련·의식변화) → 즉시 응급실',1);
INSERT INTO vaccine_effects (id,vaccine_id,effect_type,content,order_num) VALUES (67,'JE','emergency','아나필락시스 증상 → 즉시 응급실',2);
INSERT INTO vaccines (id,name,timing,description,order_num) VALUES ('Flu','인플루엔자 (독감)','6개월 이후 매년 (첫해 4주 간격 2회)','근육주사, 매년 10월 이전 권장',12);
INSERT INTO vaccine_effects (id,vaccine_id,effect_type,content,order_num) VALUES (68,'Flu','normal','접종 부위 발적·통증·부종 (1-2일)',1);
INSERT INTO vaccine_effects (id,vaccine_id,effect_type,content,order_num) VALUES (69,'Flu','normal','미열·피로감·근육통',2);
INSERT INTO vaccine_effects (id,vaccine_id,effect_type,content,order_num) VALUES (70,'Flu','caution','달걀 알레르기 심한 경우 의사 상담 후 접종',1);
INSERT INTO vaccine_effects (id,vaccine_id,effect_type,content,order_num) VALUES (71,'Flu','caution','38.5°C 이상 발열 지속 → 소아과',2);
INSERT INTO vaccine_effects (id,vaccine_id,effect_type,content,order_num) VALUES (72,'Flu','emergency','아나필락시스 증상 → 즉시 응급실 (접종 후 15-30분 의료기관 대기 필수)',1);
