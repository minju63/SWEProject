"""
부산청년플랫폼(young.busan.go.kr) 취업·진로 데이터 크롤러
- 범위: 부산광역시 / 부산진구 / 사하구
- 분야: 일자리분야 전체 + 교육분야 중 취업 관련 키워드(자격증·면접·멘토링 등)
- 결과: busan_youth_job.csv (엑셀에서 바로 열림)

설치:  pip install requests beautifulsoup4
실행:  python busan_youth_job_crawler.py
"""
import csv
import re
import time
from datetime import date

import requests
from bs4 import BeautifulSoup

BASE = "https://young.busan.go.kr"
LIST_URL = BASE + "/policySupport/list.nm"
VIEW_URL = BASE + "/policySupport/view.nm"

# 담당기관 코드 (사이트 검색 필터 값)
REGIONS = {
    "부산광역시": "003002002000",
    "부산진구": "003002002005",
    "사하구": "003002002010",
    "기타(부산 유관기관)": "990000000",
}
# 정책유형 코드
JOB = "023010"   # 일자리분야
EDU = "023030"   # 교육분야 (키워드로 취업 관련만 남김)

EDU_KEYWORDS = re.compile(
    r"취업|자격|면접|멘토|직무|채용|진로|컨설팅|정장|인턴|일경험|구직|이력서|자소서|잡|JOB|커리어|창업",
    re.I,
)

# 세부분류 자동 태깅 (팀 공통 스키마의 '세부분류' 컬럼)
SUBCATS = [
    ("면접정장대여", r"정장|면접복장"),
    ("인턴십·일경험", r"인턴|일경험|행정인턴"),
    ("멘토링", r"멘토|현직자"),
    ("자격증지원", r"자격|응시료|컴퓨터활용|토익|NCS"),
    ("취업상담·교육", r"상담|컨설팅|코칭|면접|이력서|자소서|아카데미|특강|취업"),
    ("창업지원", r"창업|입주|로컬크리에이터|스토어"),
    ("채용공고", r"채용|모집공고|박람회"),
]

HEADERS = {"User-Agent": "Mozilla/5.0 (student capstone project; busan youth info)"}
DELAY = 0.5  # 서버 부담 줄이기 위한 요청 간격(초)

session = requests.Session()
session.headers.update(HEADERS)


def get_soup(url, params):
    r = session.get(url, params=params, timeout=20)
    r.raise_for_status()
    time.sleep(DELAY)
    return BeautifulSoup(r.text, "html.parser")


def crawl_list(region_code, plc_code):
    """목록 페이지를 끝까지 돌며 카드 정보 수집"""
    items, page = [], 1
    while True:
        soup = get_soup(LIST_URL, {
            "menuCd": 12, "busPlcCd": plc_code,
            "sggCd": region_code, "pageIndex": page,
        })
        cards = soup.select('a[href*="policySupport/view.nm"]')
        if not cards:
            break
        for a in cards:
            m = re.search(r"bizSid=(\w+)", a.get("href", ""))
            txt = lambda sel: (a.select_one(sel).get_text(strip=True)
                               if a.select_one(sel) else "")
            items.append({
                "id": m.group(1) if m else "",
                "상태": txt(".cd_state"),
                "정책명": txt(".card_tit"),
                "담당기관": txt(".card_dptmt"),
                "신청기간": txt(".period_num"),
            })
        page += 1
        if page > 100:  # 안전장치
            break
    return items


def crawl_detail(biz_id):
    """상세 페이지: 진행일정, 지원대상, 문의, 본문"""
    soup = get_soup(VIEW_URL, {"menuCd": 13, "bizSid": biz_id})
    info = {}
    for li in soup.select(".dt_list li"):
        k = li.select_one(".dtif_atc")
        v = li.select_one(".dtif_cont")
        if k and v:
            info[k.get_text(strip=True)] = v.get_text(" ", strip=True)
    body_el = soup.select_one(".cont_section .text")
    body = ""
    if body_el:
        for t in body_el(["style", "script", "meta"]):
            t.decompose()
        body = body_el.get_text("\n", strip=True)
        body = re.sub(r"\[data-hwpjson\][\s\S]*", "", body)  # 한글(HWP) 잔여 데이터 제거
        body = re.sub(r"\n{2,}", "\n", body).strip()
    links = [a["href"] for a in soup.select(".cont_section a[href^='http']")
             if "young.busan" not in a["href"]]
    return info, body, links


def tag_subcat(text):
    tags = [name for name, pat in SUBCATS if re.search(pat, text)]
    return ", ".join(tags) if tags else "기타"


def main():
    today = date.today().isoformat()
    rows, seen = [], set()

    for region, rcode in REGIONS.items():
        targets = [(JOB, "일자리분야")]
        if region in ("부산진구", "사하구"):
            targets.append((EDU, "교육분야"))
        for plc, plc_name in targets:
            cards = crawl_list(rcode, plc)
            if plc == EDU:
                cards = [c for c in cards if EDU_KEYWORDS.search(c["정책명"])]
            print(f"[{region} / {plc_name}] {len(cards)}건")
            for c in cards:
                if c["id"] in seen:          # 중복 제거
                    continue
                seen.add(c["id"])
                try:
                    info, body, links = crawl_detail(c["id"])
                except Exception as e:
                    print("  상세 실패:", c["id"], e)
                    info, body, links = {}, "", []
                rows.append({
                    "id": c["id"],
                    "정책명": c["정책명"],
                    "분야": "취업·진로",
                    "세부분류": tag_subcat(c["정책명"] + " " + body[:300]),
                    "지원범위": "부산" if region.startswith(("부산광역시", "기타")) else region,
                    "원본정책유형": plc_name,
                    "모집상태": c["상태"] or "미표기",
                    "대상": info.get("지원대상", ""),
                    "신청기간": c["신청기간"],
                    "진행일정": info.get("진행일정", ""),
                    "지원내용": body[:2000],
                    "담당기관": c["담당기관"],
                    "연락처": info.get("문의", ""),
                    "외부링크": " ".join(links[:3]),
                    "출처URL": f"{VIEW_URL}?menuCd=13&bizSid={c['id']}",
                    "수집일": today,
                })

    out = "busan_youth_job.csv"
    with open(out, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    print(f"\n완료: {len(rows)}건 → {out}")
    print("모집중:", sum(r["모집상태"] == "모집중" for r in rows), "건")


if __name__ == "__main__":
    main()
