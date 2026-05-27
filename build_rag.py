"""
RAG 전처리 스크립트
data_for_RAG/ 폴더의 PDF/TXT 파일에서
  - rag_chunks.json  : 텍스트 청크 + 메타데이터
  - rag_figures.json : 표/그림 제목 + 이미지 경로 + 메타데이터
  - data_for_RAG/processed/figures/ : 추출된 이미지 PNG

실행: python3 build_rag.py
"""

import fitz          # PyMuPDF
import json, re, os, hashlib
from pathlib import Path

# ── 경로 ─────────────────────────────────────────────────────
BASE   = Path("/mnt/c/Users/ssunn/OneDrive/Documents/GitHub/chatbot0605")
SRC    = BASE / "data_for_RAG"
OUT    = BASE / "data_for_RAG" / "processed"
FIG_DIR = OUT / "figures"
OUT.mkdir(exist_ok=True)
FIG_DIR.mkdir(exist_ok=True)

# ── 소스 파일 정의 ─────────────────────────────────────────
SOURCES = [
    # (파일명, 표시이름, 타입, 카테고리)
    ("초보아빠를위한 육아가이드.pdf",                     "초보아빠를위한 육아가이드",             "book",      "general"),
    ("[수탁보고 2017] 행복을 키우는 작은 육아_실속육아 실천 가이드북.pdf", "실속육아 실천 가이드북", "book",   "general"),
    ("소아청소년하기도감염의항생제사용지침.pdf",           "소아청소년 하기도감염 항생제 사용지침", "guideline", "respiratory"),
    ("2008 소아 청소년 천식 진료가이드라인.pdf",          "소아청소년 천식 진료 가이드라인",       "guideline", "respiratory"),
    ("소아 청소년 알레르기비염 진료 가이드라인.pdf",       "소아청소년 알레르기비염 진료 가이드라인","guideline", "allergy"),
    ("소아 청소년 아토피피부염 진료가이드라인.pdf",        "소아청소년 아토피피부염 진료 가이드라인","guideline", "allergy"),
    ("즉시형 식품알레르기 치료지침.pdf",                  "즉시형 식품알레르기 치료지침",          "guideline", "allergy"),
    ("covid19_소아감염학회권고_20200320.pdf",             "소아 COVID-19 감염학회 권고",           "guideline", "infection"),
    ("ADD1_CPRbbs_2020년 한국심폐소생술 가이드라인(2021.04 수정).pdf", "2020 한국심폐소생술 가이드라인", "guideline", "emergency"),
    ("AAP_안전수면_가이드라인_2022_원본.txt",             "AAP 안전수면 가이드라인 2022",          "guideline", "sleep"),
    ("한국_영유아건강검진_예방접종_가이드_원본.txt",       "한국 영유아 건강검진·예방접종 가이드",  "guideline", "vaccination"),
]

# ── 표/그림 캡션 패턴 ─────────────────────────────────────
FIG_PATTERN = re.compile(
    r'(【표\s*\d+[】\s]|【그림\s*\d+[】\s]'
    r'|표\s*\d+[\.\s\-]|그림\s*\d+[\.\s\-]'
    r'|Table\s*\d+[\.\s]|Figure\s*\d+[\.\s])',
    re.IGNORECASE
)
TOC_PATTERN = re.compile(r'[·\.]{5,}')   # 목차 점선 감지

def clean_fig_title(text: str) -> str:
    """목차 점선·페이지번호 제거"""
    text = TOC_PATTERN.sub('', text)
    text = re.sub(r'\s+\d{1,3}\s*$', '', text)
    return text.strip()

CHUNK_SIZE   = 800   # 목표 청크 글자 수
CHUNK_OVERLAP = 100  # 청크 간 오버랩

# ── 카테고리 키워드 매핑 ──────────────────────────────────
CATEGORY_KEYWORDS = {
    "feeding":      ["수유", "분유", "모유", "이유식", "수유량", "젖병", "보충식"],
    "sleep":        ["수면", "잠", "안전수면", "낮잠", "수면환경", "sids", "영아돌연사"],
    "vaccination":  ["예방접종", "백신", "접종", "dtap", "bcg", "로타", "폐렴구균"],
    "development":  ["발달", "성장", "발달지표", "언어발달", "운동발달", "인지발달"],
    "allergy":      ["알레르기", "아토피", "두드러기", "식품알레르기", "비염", "천식"],
    "respiratory":  ["천식", "기관지", "폐렴", "기침", "호흡", "하기도", "상기도"],
    "infection":    ["감염", "발열", "열", "항생제", "바이러스", "covid", "코로나"],
    "emergency":    ["심폐소생", "cpr", "응급", "질식", "이물"],
    "general":      ["육아", "양육", "아빠", "부모", "임신"],
}

def guess_category(text: str) -> str:
    t = text.lower()
    scores = {cat: sum(1 for kw in kws if kw in t) for cat, kws in CATEGORY_KEYWORDS.items()}
    return max(scores, key=scores.get) if max(scores.values()) > 0 else "general"

def chunk_text(text: str, size=CHUNK_SIZE, overlap=CHUNK_OVERLAP):
    """단락 경계를 우선으로 청크 분할"""
    paragraphs = [p.strip() for p in re.split(r'\n{2,}', text) if p.strip()]
    chunks, current = [], ""
    for para in paragraphs:
        if len(current) + len(para) > size and current:
            chunks.append(current.strip())
            current = current[-overlap:] + "\n\n" + para
        else:
            current = (current + "\n\n" + para).strip()
    if current.strip():
        chunks.append(current.strip())
    return chunks

def short_id(source: str, page: int, idx: int) -> str:
    h = hashlib.md5(f"{source}{page}{idx}".encode()).hexdigest()[:6]
    return f"chunk_{h}"

def fig_id(source: str, page: int, idx: int) -> str:
    h = hashlib.md5(f"fig{source}{page}{idx}".encode()).hexdigest()[:6]
    return f"fig_{h}"

# ── PDF 처리 ─────────────────────────────────────────────
def process_pdf(path: Path, display_name: str, doc_type: str, base_category: str,
                all_chunks: list, all_figures: list):
    try:
        doc = fitz.open(str(path))
    except Exception as e:
        print(f"  [오류] PDF 열기 실패: {e}")
        return

    # 텍스트 추출 가능 여부 확인 (처음 15페이지 중 텍스트가 있는 페이지 탐색)
    sample = ""
    for check_i in range(min(15, len(doc))):
        sample = doc[check_i].get_text().strip()
        if len(sample) > 50:
            break
    if len(sample) < 50:
        print(f"  [스킵] 스캔 전용 PDF (텍스트 없음)")
        return

    chunk_idx = 0
    fig_idx   = 0

    for page_num in range(len(doc)):
        page   = doc[page_num]
        blocks = page.get_text("blocks")   # (x0,y0,x1,y1, text, block_no, type)
        images = page.get_images(full=True)

        # 이미지 위치 맵 (bbox → xref)
        img_bboxes = {}
        for img_info in images:
            xref = img_info[0]
            rects = page.get_image_rects(xref)
            for r in rects:
                img_bboxes[xref] = r

        page_text_parts = []
        i = 0
        while i < len(blocks):
            btype = blocks[i][6]
            btext = blocks[i][4].strip() if btype == 0 else ""

            # ── 표/그림 캡션 감지 ──────────────────────────
            if btype == 0 and FIG_PATTERN.search(btext) and len(btext) < 200:
                # 목차 점선이 많으면 스킵 (TOC 페이지)
                if TOC_PATTERN.search(btext) and btext.count('·') > 10:
                    page_text_parts.append(btext)
                    i += 1
                    continue
                caption = clean_fig_title(btext)
                # 캡션 아래 추가 설명 수집 (다음 1~2 블록)
                desc_parts = []
                for j in range(i+1, min(i+3, len(blocks))):
                    nb = blocks[j]
                    if nb[6] == 0 and len(nb[4].strip()) < 300:
                        desc_parts.append(nb[4].strip())

                # 인접 이미지 찾기 (캡션 bbox 기준 ±200px 이내)
                cap_bbox = blocks[i][:4]   # x0,y0,x1,y1
                nearest_xref = None
                min_dist     = float('inf')
                for xref, r in img_bboxes.items():
                    cy = (cap_bbox[1] + cap_bbox[3]) / 2
                    iy = (r.y0 + r.y1) / 2
                    dist = abs(cy - iy)
                    if dist < min_dist and dist < 400:
                        min_dist     = dist
                        nearest_xref = xref

                # 이미지 저장
                img_file = None
                if nearest_xref:
                    try:
                        base_img = doc.extract_image(nearest_xref)
                        ext      = base_img["ext"]
                        fid      = fig_id(display_name, page_num+1, fig_idx)
                        img_file = f"{fid}.{ext}"
                        img_path = FIG_DIR / img_file
                        with open(img_path, "wb") as f:
                            f.write(base_img["image"])
                    except Exception:
                        img_file = None

                all_figures.append({
                    "id":      fig_id(display_name, page_num+1, fig_idx),
                    "title":   caption,
                    "caption": " ".join(desc_parts),
                    "image":   img_file,
                    "metadata": {
                        "source":   display_name,
                        "page":     page_num + 1,
                        "type":     doc_type,
                        "category": guess_category(caption + " ".join(desc_parts))
                                    or base_category,
                    }
                })
                fig_idx += 1
                page_text_parts.append(caption)
                i += 1
                continue

            # ── 일반 텍스트 블록 ──────────────────────────
            if btype == 0 and len(btext) > 20:
                page_text_parts.append(btext)

            i += 1

        # 페이지 텍스트를 청크로 분할
        page_text = "\n\n".join(page_text_parts)
        if len(page_text) < 50:
            continue

        for chunk in chunk_text(page_text):
            if len(chunk) < 30:
                continue
            all_chunks.append({
                "id":   short_id(display_name, page_num+1, chunk_idx),
                "text": chunk,
                "metadata": {
                    "source":   display_name,
                    "page":     page_num + 1,
                    "type":     doc_type,
                    "category": guess_category(chunk),
                }
            })
            chunk_idx += 1

    print(f"  → 청크 {chunk_idx}개, 표/그림 {fig_idx}개")

# ── TXT 처리 ─────────────────────────────────────────────
def process_txt(path: Path, display_name: str, doc_type: str, base_category: str,
                all_chunks: list, all_figures: list):
    text = path.read_text(encoding="utf-8", errors="ignore")

    # 헤더 (=== 구분선 이전) 제거
    body_match = re.search(r'={10,}\s*\n(.+)', text, re.DOTALL)
    body = body_match.group(1) if body_match else text

    chunk_idx = 0
    for i, chunk in enumerate(chunk_text(body)):
        if len(chunk) < 30:
            continue
        all_chunks.append({
            "id":   short_id(display_name, 0, chunk_idx),
            "text": chunk,
            "metadata": {
                "source":   display_name,
                "page":     None,
                "type":     doc_type,
                "category": guess_category(chunk),
            }
        })
        chunk_idx += 1

    print(f"  → 청크 {chunk_idx}개")

# ── 메인 ─────────────────────────────────────────────────
def main():
    all_chunks  = []
    all_figures = []

    for filename, display_name, doc_type, base_category in SOURCES:
        path = SRC / filename
        if not path.exists():
            print(f"[없음] {filename}")
            continue

        print(f"\n[처리] {display_name}")
        if filename.endswith(".pdf"):
            process_pdf(path, display_name, doc_type, base_category, all_chunks, all_figures)
        else:
            process_txt(path, display_name, doc_type, base_category, all_chunks, all_figures)

    # 저장
    chunks_path  = OUT / "rag_chunks.json"
    figures_path = OUT / "rag_figures.json"

    with open(chunks_path,  "w", encoding="utf-8") as f:
        json.dump(all_chunks,  f, ensure_ascii=False, indent=2)
    with open(figures_path, "w", encoding="utf-8") as f:
        json.dump(all_figures, f, ensure_ascii=False, indent=2)

    print(f"\n✅ 완료")
    print(f"   청크  : {len(all_chunks)}개  → {chunks_path}")
    print(f"   표/그림: {len(all_figures)}개 → {figures_path}")
    print(f"   이미지 : {len(list(FIG_DIR.iterdir()))}개 → {FIG_DIR}")

if __name__ == "__main__":
    main()
