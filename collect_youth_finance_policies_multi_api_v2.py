from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import os
import re
import time
import unicodedata
import urllib.robotparser
from dataclasses import dataclass, field
from datetime import date, datetime
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import urljoin, urlparse
from xml.etree import ElementTree as ET
from zoneinfo import ZoneInfo

import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from pypdf import PdfReader

# -----------------------------------------------------------------------------
# 기본 설정
# -----------------------------------------------------------------------------
API_URL = "https://www.youthcenter.go.kr/go/ythip/getPlcy"
KST = ZoneInfo("Asia/Seoul")
TODAY = datetime.now(KST).date()
USER_AGENT = (
    "BusanYouthPolicyResearchBot/1.0 "
    "(academic project; official-public-data collection; contact: local-project)"
)
REQUEST_TIMEOUT = 25
REQUEST_DELAY_SECONDS = 0.6
RESPECT_ROBOTS = True


# 온통청년 API별 환경변수 이름
# 사용자가 발급받은 API 종류별 키를 각각 분리해 관리한다.
# 현재 장학·금융 수집기에서 실제 호출하는 것은 청년정책 API이며,
# 나머지 키는 같은 프로젝트에서 청년콘텐츠/청년센터/기본계획 API를 붙일 때 그대로 재사용할 수 있다.
YOUTHCENTER_API_KEY_ENVS = {
    "policy": "YOUTHCENTER_POLICY_API_KEY",
    "focus_task": "YOUTHCENTER_FOCUS_TASK_API_KEY",
    "policy_direction": "YOUTHCENTER_POLICY_DIRECTION_API_KEY",
    "content": "YOUTHCENTER_CONTENT_API_KEY",
    "plan_task": "YOUTHCENTER_PLAN_TASK_API_KEY",
    "center": "YOUTHCENTER_CENTER_API_KEY",
}

# 기존 코드와의 호환용. 새 프로젝트에서는 위 6개 전용 키 사용을 권장한다.
LEGACY_API_KEY_ENV = "YOUTHCENTER_API_KEY"


def load_youthcenter_api_keys() -> dict[str, str]:
    """
    .env에서 온통청년 API별 인증키를 읽는다.

    반환 예시:
    {
        "policy": "...",
        "focus_task": "...",
        "policy_direction": "...",
        "content": "...",
        "plan_task": "...",
        "center": "...",
    }

    주의: 키 값 자체는 로그나 CSV에 출력하지 않는다.
    """
    keys: dict[str, str] = {}
    for api_name, env_name in YOUTHCENTER_API_KEY_ENVS.items():
        keys[api_name] = os.getenv(env_name, "").strip()

    # 예전 YOUTHCENTER_API_KEY만 설정한 경우 청년정책 API 키로 fallback
    if not keys["policy"]:
        legacy = os.getenv(LEGACY_API_KEY_ENV, "").strip()
        if legacy:
            keys["policy"] = legacy

    return keys


def print_api_key_status(keys: dict[str, str]) -> None:
    """키 문자열은 노출하지 않고 설정 여부만 출력."""
    labels = {
        "policy": "청년정책API",
        "focus_task": "기본계획중점과제API",
        "policy_direction": "기본계획정책방향API",
        "content": "청년콘텐츠API",
        "plan_task": "기본계획과제API",
        "center": "청년센터API",
    }
    print("[온통청년 API 키 설정 상태]")
    for api_name, label in labels.items():
        print(f"- {label}: {'설정됨' if keys.get(api_name) else '미설정'}")

OUTPUT_COLUMNS = [
    "data_id",
    "데이터유형",
    "정책명",
    "대분류",
    "세부분류",
    "추가태그",
    "팀 조사담당자",
    "신청범위",
    "대상유형",
    "대상시도",
    "대상시군구",
    "시행기관",
    "운영기관",
    "기관 담당부서",
    "지원내용",
    "지원금액",
    "지원대상_원문",
    "연령조건_원문",
    "최소연령",
    "최대연령",
    "거주조건_원문",
    "거주기간_개월",
    "활동지역인정",
    "취업상태",
    "학력·재학조건",
    "소득조건",
    "특화대상",
    "제외대상",
    "기타조건",
    "신청시작일",
    "신청마감일",
    "운영시작일",
    "운영종료일",
    "상시모집",
    "진행상태",
    "신청방법",
    "신청URL",
    "문의처",
    "원문URL",
    "게시일",
    "수집일",
    "최종확인일",
    "요약",
    "비고",
    "수집방식",  # 요청 편의를 위해 추가. strict schema가 필요하면 이 열만 제거 가능.
]

EMPTY_UNKNOWN = "확인필요"
NO_LIMIT = "제한없음"

# 신청범위 판단용 5자리 시군구 코드. 온통청년 문서의 zipCd가 이 체계를 사용.
# 부산광역시 26000 / 부산진구 26230 / 사하구 26380
REGION_CODE_MAP = {
    "26000": ("부산", "부산광역시", ""),
    "26230": ("부산진구", "부산광역시", "부산진구"),
    "26380": ("사하구", "부산광역시", "사하구"),
}

OFFICIAL_DOMAINS = {
    "youthcenter.go.kr",
    "kosaf.go.kr",
    "www.kosaf.go.kr",
    "bokjiro.go.kr",
    "www.bokjiro.go.kr",
    "fsc.go.kr",
    "www.fsc.go.kr",
    "kinfa.or.kr",
    "www.kinfa.or.kr",
    "busan.go.kr",
    "www.busan.go.kr",
    "young.busan.go.kr",
    "saha.go.kr",
    "www.saha.go.kr",
    "news.saha.go.kr",
    "friend.saha.go.kr",
    "lll.saha.go.kr",
    "busanjin.go.kr",
    "www.busanjin.go.kr",
}


@dataclass
class PolicySeed:
    name: str
    api_queries: list[str]
    official_url: str | None
    apply_url: str | None = None
    expected_scope: str | None = None
    subclass: str = "기타"
    tags: list[str] = field(default_factory=list)
    target_hint: str | None = None
    aliases: list[str] = field(default_factory=list)


POLICY_SEEDS: list[PolicySeed] = [
    PolicySeed(
        name="국가장학금Ⅰ유형",
        api_queries=["국가장학금Ⅰ유형", "국가장학금 I유형", "국가장학금"],
        official_url="https://www.kosaf.go.kr/ko/scholar.do?pg=scholarship05_12_01_01_02p",
        expected_scope="전국",
        subclass="장학금",
        tags=["국가장학금", "등록금"],
        target_hint="대학생",
        aliases=["국가장학금Ⅰ유형", "국가장학금 I유형", "국가장학금 Ⅰ유형", "국가장학금 1유형"],
    ),
    PolicySeed(
        name="다자녀 국가장학금",
        api_queries=["다자녀 국가장학금", "다자녀장학금"],
        official_url="https://www.kosaf.go.kr/ko/scholar.do?pg=scholarship05_12_10",
        expected_scope="전국",
        subclass="장학금",
        tags=["다자녀", "국가장학금", "등록금"],
        target_hint="대학생",
    ),
    PolicySeed(
        name="국가근로장학금",
        api_queries=["국가근로장학금", "국가 근로 장학금"],
        official_url="https://www.kosaf.go.kr/ko/scholar.do?pg=scholarship05_04_01&ttab1=4",
        expected_scope="전국",
        subclass="장학금",
        tags=["근로장학금", "대학생"],
        target_hint="대학생",
    ),
    PolicySeed(
        name="일반 상환 학자금대출",
        api_queries=["일반 상환 학자금대출", "일반상환 학자금대출"],
        official_url="https://www.kosaf.go.kr/ko/tuition.do?pg=tuition04_02_02p",
        expected_scope="전국",
        subclass="학자금대출",
        tags=["학자금", "등록금대출", "생활비대출"],
        target_hint="대학생·대학원생",
    ),
    PolicySeed(
        name="취업 후 상환 학자금대출",
        api_queries=["취업 후 상환 학자금대출", "취업후상환 학자금대출"],
        official_url="https://www.kosaf.go.kr/ko/tuition.do?naviParam=HD&pg=tuition04_01_01",
        expected_scope="전국",
        subclass="학자금대출",
        tags=["학자금", "취업후상환", "생활비대출"],
        target_hint="대학생·대학원생",
    ),
    PolicySeed(
        name="청년내일저축계좌",
        api_queries=["청년내일저축계좌"],
        official_url="https://www.bokjiro.go.kr/ssis-tbu/twataa/wlfareInfo/moveTWAT52011M.do?wlfareInfoId=WLF00000060&wlfareInfoReldBztpCd=01",
        expected_scope="전국",
        subclass="자산형성",
        tags=["저축", "자산형성", "근로청년"],
        target_hint="청년",
    ),
    PolicySeed(
        name="청년미래적금",
        api_queries=["청년미래적금"],
        official_url="https://www.fsc.go.kr/no010101/87726",
        expected_scope="전국",
        subclass="자산형성",
        tags=["적금", "자산형성", "정부기여금"],
        target_hint="청년",
    ),
    PolicySeed(
        name="부산청년 기쁨두배통장",
        api_queries=["부산청년 기쁨두배통장", "기쁨두배통장"],
        official_url="https://young.busan.go.kr/index.nm?menuCd=53",
        apply_url="https://www.boogi2.kr/",
        expected_scope="부산",
        subclass="자산형성",
        tags=["저축", "자산형성", "부산청년"],
        target_hint="청년",
    ),
    PolicySeed(
        name="부산지역인재 장학금",
        api_queries=["부산지역인재 장학금", "부산 지역인재 장학금"],
        official_url="https://young.busan.go.kr/index.nm?menuCd=164",
        expected_scope="부산",
        subclass="장학금",
        tags=["지역인재", "IT", "상경", "생활장학금"],
        target_hint="대학생",
    ),
    PolicySeed(
        name="부산광역시 대학(원)생 학자금대출 이자지원",
        api_queries=["학자금 대출이자 지원", "부산 학자금 대출이자", "대학원생 학자금대출 이자지원"],
        official_url="https://young.busan.go.kr/index.nm?menuCd=49",
        expected_scope="부산",
        subclass="학자금지원",
        tags=["학자금대출", "이자지원", "대학생", "대학원생"],
        target_hint="대학생·대학원생·졸업생",
        aliases=["부산광역시 대학(원)생 학자금대출 이자지원", "학자금 대출이자 지원", "부산 학자금대출 이자지원"],
    ),
    PolicySeed(
        name="(재)부산진구장학회 대학생 장학금",
        api_queries=["부산진구장학회", "부산진구 장학금", "부산진구 대학생 장학금"],
        # 시행기관 공식 개별 공고 URL을 찾지 못한 경우 API의 refUrlAddr를 우선 사용.
        official_url="https://www.busanjin.go.kr/",
        expected_scope="부산진구",
        subclass="장학금",
        tags=["부산진구", "대학생", "장학금"],
        target_hint="대학생",
        aliases=["부산진구장학회 대학생 장학금", "부산진구장학회 장학금"],
    ),
    PolicySeed(
        name="(재)사하구장학회 저소득 대학생 장학",
        api_queries=["사하구장학회", "사하구 장학금", "사하구 저소득 대학생 장학"],
        official_url="https://news.saha.go.kr/portal/contents.do?mId=0507040000",
        expected_scope="사하구",
        subclass="장학금",
        tags=["사하구", "저소득", "자립준비청년", "대학생"],
        target_hint="저소득 대학생·자립준비청년",
        aliases=["사하구장학회 저소득 대학생 장학", "사하구장학회 장학금"],
    ),
]


# -----------------------------------------------------------------------------
# 공통 유틸
# -----------------------------------------------------------------------------
def clean_text(value: Any) -> str:
    if value is None:
        return ""
    s = str(value).replace("\xa0", " ")
    s = re.sub(r"[ \t]+", " ", s)
    s = re.sub(r"\n{3,}", "\n\n", s)
    return s.strip()


def norm_name(s: str) -> str:
    s = unicodedata.normalize("NFKC", s or "").lower()
    s = s.replace("Ⅰ", "1").replace("Ⅱ", "2").replace("Ⅲ", "3")
    s = re.sub(r"[^0-9a-z가-힣]", "", s)
    return s


def first_nonempty(*values: Any, default: str = EMPTY_UNKNOWN) -> str:
    for v in values:
        t = clean_text(v)
        if t and t not in {"None", "null", "NULL"}:
            return t
    return default


def as_joined(values: Iterable[Any], sep: str = " | ") -> str:
    out: list[str] = []
    for v in values:
        t = clean_text(v)
        if t and t not in out:
            out.append(t)
    return sep.join(out)


def normalize_date_string(s: str) -> str:
    """날짜/일시 문자열을 YYYY-MM-DD로 가능한 범위에서 정규화."""
    s = clean_text(s)
    if not s:
        return ""
    m = re.search(r"(20\d{2})[-./년\s]+(\d{1,2})[-./월\s]+(\d{1,2})", s)
    if m:
        y, mo, d = map(int, m.groups())
        try:
            return date(y, mo, d).isoformat()
        except ValueError:
            return ""
    return ""


def parse_date_range(text: str) -> tuple[str, str]:
    """2026. 8. 10 ~ 8.21 / 2026-08-10~2026-08-21 등을 보수적으로 파싱."""
    text = clean_text(text)
    if not text:
        return "", ""

    # 괄호 속 요일과 시간을 제거해 날짜 정규식 오탐 감소
    slim = re.sub(r"\([^)]*\)", " ", text)
    slim = re.sub(r"\b\d{1,2}:\d{2}\b", " ", slim)

    full = list(re.finditer(r"(20\d{2})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})\s*일?", slim))
    if len(full) >= 2:
        a = normalize_date_string(full[0].group(0))
        b = normalize_date_string(full[1].group(0))
        return a, b
    if len(full) == 1:
        start = normalize_date_string(full[0].group(0))
        y = int(full[0].group(1))
        tail = slim[full[0].end():]
        # 두 번째 날짜에 연도가 생략된 경우
        m2 = re.search(r"(?:~|부터|[-–—])?\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})\s*일?", tail)
        if m2:
            try:
                end = date(y, int(m2.group(1)), int(m2.group(2))).isoformat()
                return start, end
            except ValueError:
                pass
        return start, ""

    # YYYYMMDD-YYYYMMDD 형태
    compact = re.findall(r"(20\d{6})", slim)
    if compact:
        vals = []
        for raw in compact[:2]:
            try:
                vals.append(datetime.strptime(raw, "%Y%m%d").date().isoformat())
            except ValueError:
                pass
        if vals:
            return vals[0], vals[1] if len(vals) > 1 else ""
    return "", ""


def calc_status(start: str, end: str, always: str) -> str:
    if always == "예":
        return "상시"
    try:
        s = date.fromisoformat(start) if start else None
        e = date.fromisoformat(end) if end else None
    except ValueError:
        return "확인필요"

    if s and TODAY < s:
        return "모집예정"
    if s and e and s <= TODAY <= e:
        return "모집중"
    if e and TODAY > e:
        return "마감"
    if s and not e and TODAY >= s:
        return "확인필요"
    return "확인필요"


def stable_id(policy_name: str, source_url: str, api_no: str = "") -> str:
    if api_no:
        return f"YOUTH-{api_no}"
    digest = hashlib.sha1(f"{policy_name}|{source_url}".encode("utf-8")).hexdigest()[:12].upper()
    return f"WEB-{digest}"


def blank_row() -> dict[str, str]:
    return {c: EMPTY_UNKNOWN for c in OUTPUT_COLUMNS}


# -----------------------------------------------------------------------------
# API 후보 지역 검증
# -----------------------------------------------------------------------------
# 정책명 유사도만으로 매칭하면 "부산 학자금 대출이자"가 광주권역 사업으로
# 잘못 붙는 식의 오탐이 발생할 수 있다. 따라서 zipCd, 기관명, 정책명,
# 참고 URL까지 함께 보고 조사대상 지역과 충돌하는 후보는 제거한다.
OTHER_REGION_KEYWORDS = {
    "서울": ["서울특별시", "서울시", "서울", "seoul"],
    "대구": ["대구광역시", "대구시", "대구", "daegu"],
    "인천": ["인천광역시", "인천시", "인천", "incheon"],
    "광주": ["광주광역시", "광주시", "광주권역", "광주", "gwangju"],
    "대전": ["대전광역시", "대전시", "대전", "daejeon"],
    "울산": ["울산광역시", "울산시", "울산", "ulsan"],
    "세종": ["세종특별자치시", "세종시", "세종", "sejong"],
    "경기": ["경기도", "경기", "gyeonggi"],
    "강원": ["강원특별자치도", "강원도", "강원", "gangwon"],
    "충북": ["충청북도", "충북", "chungbuk"],
    "충남": ["충청남도", "충남", "chungnam"],
    "전북": ["전북특별자치도", "전라북도", "전북", "jeonbuk"],
    "전남": ["전라남도", "전남", "jeonnam"],
    "경북": ["경상북도", "경북", "gyeongbuk"],
    "경남": ["경상남도", "경남", "gyeongnam"],
    "제주": ["제주특별자치도", "제주도", "제주", "jeju"],
}

BUSAN_KEYWORDS = ["부산광역시", "부산시", "부산", "busan"]
BUSANJIN_KEYWORDS = ["부산진구", "busanjin"]
SAHA_KEYWORDS = ["사하구", "saha"]


def _candidate_region_blob(cand: dict[str, Any]) -> str:
    """API 후보에서 지역 판단에 사용할 텍스트를 모은다."""
    fields = [
        "plcyNm", "plcyExplnCn", "plcySprtCn", "addAplyQlfcCndCn",
        "sprvsnInstCdNm", "operInstCdNm",
        "rgtrInstCdNm", "rgtrUpInstCdNm", "rgtrHghrkInstCdNm",
        "refUrlAddr1", "refUrlAddr2",
    ]
    return " | ".join(clean_text(cand.get(k)) for k in fields if clean_text(cand.get(k))).lower()


def _has_any(text: str, keywords: list[str]) -> bool:
    low = (text or "").lower()
    return any(k.lower() in low for k in keywords)


def candidate_region_check(cand: dict[str, Any], expected_scope: str | None) -> tuple[int, str]:
    """
    반환값:
      1  : 기대 지역이 명시적으로 확인됨
      0  : 지역 근거가 부족하지만 충돌도 확인되지 않음
     -1  : 다른 지역 사업임이 명확하여 후보에서 제외해야 함

    전국 정책의 경우 특정 지자체 사업으로 명확한 후보는 제외한다.
    """
    if not expected_scope:
        return 0, "기대지역 없음"

    blob = _candidate_region_blob(cand)
    zip_raw = clean_text(cand.get("zipCd"))
    codes = re.findall(r"\b\d{5}\b", zip_raw)

    has_busan = _has_any(blob, BUSAN_KEYWORDS)
    has_busanjin = _has_any(blob, BUSANJIN_KEYWORDS)
    has_saha = _has_any(blob, SAHA_KEYWORDS)

    other_regions = [
        region for region, kws in OTHER_REGION_KEYWORDS.items()
        if _has_any(blob, kws)
    ]

    # 부산 이외 지역명이 명시되면서 부산 근거가 없으면 지역 충돌.
    if expected_scope in {"부산", "부산진구", "사하구"}:
        if other_regions and not has_busan:
            return -1, f"타지역 명시: {', '.join(other_regions)}"

        # zipCd가 실제로 존재하는데 부산(26xxx)이 하나도 없으면 충돌.
        if codes and not any(c.startswith("26") for c in codes):
            return -1, f"zipCd가 부산권이 아님: {zip_raw}"

    if expected_scope == "부산":
        if any(c.startswith("26") for c in codes) or has_busan:
            return 1, "부산 지역 근거 확인"
        return 0, "부산 지역 근거 미확인"

    if expected_scope == "부산진구":
        if "26230" in codes or has_busanjin:
            return 1, "부산진구 지역 근거 확인"
        if "26380" in codes or has_saha:
            return -1, "사하구 사업으로 확인됨"
        # 부산 전체까지만 확인되면 구 단위 정책인지 확정할 수 없음.
        if any(c.startswith("26") for c in codes) or has_busan:
            return 0, "부산권이지만 부산진구 근거 미확인"
        return 0, "부산진구 지역 근거 미확인"

    if expected_scope == "사하구":
        if "26380" in codes or has_saha:
            return 1, "사하구 지역 근거 확인"
        if "26230" in codes or has_busanjin:
            return -1, "부산진구 사업으로 확인됨"
        if any(c.startswith("26") for c in codes) or has_busan:
            return 0, "부산권이지만 사하구 근거 미확인"
        return 0, "사하구 지역 근거 미확인"

    if expected_scope == "전국":
        # 전국 사업인데 특정 지자체만을 대상으로 하는 후보는 피한다.
        # 여러 지역 코드가 대량으로 있는 경우는 전국성 데이터일 수 있어 보류한다.
        if "전국" in blob or "대한민국" in blob or "전 국민" in blob:
            return 1, "전국 대상 문구 확인"
        if len(codes) == 1:
            return -1, f"단일 지역 zipCd가 명시됨: {zip_raw}"
        if other_regions or has_busan:
            # 중앙사업의 지역 안내 페이지를 잘못 집는 것을 방지하기 위해
            # 특정 지역 표기가 있는 후보는 전국 seed에서 제외한다.
            regions = other_regions + (["부산"] if has_busan else [])
            return -1, f"특정 지역 사업/안내로 판단: {', '.join(regions)}"
        return 0, "전국 여부 직접 근거 미확인"

    return 0, "지역 검증 규칙 없음"


def url_region_compatible(url: str, expected_scope: str | None) -> bool:
    """API refUrl이 명백히 다른 지역 사이트면 크롤링하지 않는다."""
    if not url or not expected_scope:
        return True
    low = url.lower()

    # 기대지역이 부산권인데 광주/서울 등 타지역 도메인이면 차단
    if expected_scope in {"부산", "부산진구", "사하구"}:
        for _, kws in OTHER_REGION_KEYWORDS.items():
            for k in kws:
                # 한글 지역명 또는 영문 도메인 토큰 모두 검사
                if k.lower() in low:
                    return False

    # 전국 seed는 특정 지자체 도메인보다 중앙/공공기관 원문을 우선한다.
    if expected_scope == "전국":
        local_tokens = [
            "gwangju", "seoul", "daegu", "incheon", "daejeon", "ulsan",
            "sejong", "gyeonggi", "gangwon", "chungbuk", "chungnam",
            "jeonbuk", "jeonnam", "gyeongbuk", "gyeongnam", "jeju",
            "busan.go.kr", "saha.go.kr", "busanjin.go.kr",
        ]
        if any(tok in low for tok in local_tokens):
            return False

    return True


# -----------------------------------------------------------------------------
# 온통청년 Open API
# -----------------------------------------------------------------------------
class YouthPolicyAPI:
    def __init__(self, api_key: str, session: requests.Session):
        self.api_key = api_key
        self.session = session

    def _request(self, params: dict[str, Any]) -> Any:
        """
        온통청년 API 호출.
        - 429/5xx는 최대 3회 재시도
        - 예외 메시지에 apiKeyNm이 포함된 전체 요청 URL을 노출하지 않음
        """
        p = {
            "apiKeyNm": self.api_key,
            "pageNum": 1,
            # 정책명 검색에는 100건까지 받을 필요가 없어 서버 부담/오류 가능성을 낮춘다.
            "pageSize": 30,
            "rtnType": "json",
            **params,
        }

        max_retries = 3
        retryable = {429, 500, 502, 503, 504}

        for attempt in range(max_retries):
            try:
                r = self.session.get(API_URL, params=p, timeout=REQUEST_TIMEOUT)

                if r.status_code in retryable:
                    if attempt < max_retries - 1:
                        wait = 2 ** attempt
                        print(
                            f"[API 재시도] HTTP {r.status_code} - {wait}초 후 재시도 "
                            f"({attempt + 1}/{max_retries})"
                        )
                        time.sleep(wait)
                        continue
                    raise RuntimeError(f"온통청년 API 서버 오류: HTTP {r.status_code}")

                if r.status_code >= 400:
                    # requests의 HTTPError 문자열은 인증키가 포함된 URL을 노출할 수 있으므로 직접 처리
                    raise RuntimeError(f"온통청년 API 요청 실패: HTTP {r.status_code}")

                time.sleep(REQUEST_DELAY_SECONDS)

                try:
                    return r.json()
                except Exception:
                    # 문서/서버 상태에 따라 XML이 반환되는 경우도 수용
                    try:
                        root = ET.fromstring(r.text)
                        return xml_to_dict(root)
                    except Exception as e:
                        raise RuntimeError(
                            "온통청년 API 응답을 JSON/XML로 해석하지 못했습니다. "
                            f"HTTP {r.status_code}, content-type={r.headers.get('content-type')}"
                        ) from e

            except requests.RequestException as e:
                if attempt < max_retries - 1:
                    wait = 2 ** attempt
                    print(
                        f"[API 재시도] 네트워크 오류 - {wait}초 후 재시도 "
                        f"({attempt + 1}/{max_retries})"
                    )
                    time.sleep(wait)
                    continue
                raise RuntimeError(
                    f"온통청년 API 네트워크 요청 실패: {type(e).__name__}"
                ) from e

        raise RuntimeError("온통청년 API 요청 실패")

    def search(self, query: str) -> list[dict[str, Any]]:
        """
        1차 정책명(plcyNm) 검색.
        결과가 없거나 서버 오류가 나면 2차 정책키워드(plcyKywdNm) 검색.
        """
        name_error: Exception | None = None

        try:
            payload = self._request({"pageType": 1, "plcyNm": query})
            rows = find_policy_dicts(payload)
            if rows:
                return rows
        except Exception as e:
            name_error = e

        try:
            payload = self._request({"pageType": 1, "plcyKywdNm": query})
            return find_policy_dicts(payload)
        except Exception as keyword_error:
            if name_error:
                raise RuntimeError(
                    f"정책명/키워드 검색 모두 실패 "
                    f"(정책명: {name_error}; 키워드: {keyword_error})"
                ) from keyword_error
            raise

    def detail(self, plcy_no: str) -> dict[str, Any] | None:
        payload = self._request({"pageType": 2, "plcyNo": plcy_no})
        rows = find_policy_dicts(payload)
        if not rows:
            return None
        exact = [r for r in rows if clean_text(r.get("plcyNo")) == plcy_no]
        return exact[0] if exact else rows[0]

    def find_best(self, seed: PolicySeed) -> tuple[dict[str, Any] | None, float, str, str]:
        """
        정책명 유사도 + 지역 일치 여부로 최종 후보를 고른다.

        지역 충돌(-1) 후보는 제목이 완전히 같아도 제외한다.
        부산/구 단위 후보는 지역 근거가 명시된 경우 가점을 주고,
        지역 근거가 없는 후보는 감점하여 오탐을 줄인다.
        """
        candidates: dict[str, dict[str, Any]] = {}
        used_query = ""
        rejected_notes: list[str] = []

        for q in seed.api_queries:
            try:
                rows = self.search(q)
            except Exception as e:
                print(f"[API 경고] {seed.name} / query={q}: {e}")
                continue

            for row in rows:
                key = clean_text(row.get("plcyNo")) or clean_text(row.get("plcyNm"))
                if key:
                    candidates[key] = row
            if rows:
                used_query = q

        if not candidates:
            return None, 0.0, used_query, "API 후보 없음"

        aliases = [seed.name, *seed.aliases, *seed.api_queries]
        aliases = [a for a in aliases if a]

        def title_score(cand: dict[str, Any]) -> float:
            title = clean_text(cand.get("plcyNm"))
            nt = norm_name(title)
            scores = []
            for a in aliases:
                na = norm_name(a)
                if not na:
                    continue
                seq = SequenceMatcher(None, na, nt).ratio()
                contain = 1.0 if na in nt or nt in na else 0.0
                scores.append(max(seq, contain))
            return max(scores or [0.0])

        ranked: list[tuple[float, float, int, str, dict[str, Any]]] = []

        for cand in candidates.values():
            base = title_score(cand)
            region_level, region_note = candidate_region_check(cand, seed.expected_scope)

            if region_level < 0:
                rejected_notes.append(
                    f"{clean_text(cand.get('plcyNm'))}: 지역불일치({region_note})"
                )
                continue

            adjusted = base
            if region_level == 1:
                adjusted = min(1.0, adjusted + 0.12)
            elif seed.expected_scope in {"부산", "부산진구", "사하구"}:
                # 지역사업인데 지역 근거가 전혀 없으면 보수적으로 감점
                adjusted = max(0.0, adjusted - 0.18)

            ranked.append((adjusted, base, region_level, region_note, cand))

        if not ranked:
            note = "모든 API 후보가 지역검증에서 제외됨"
            if rejected_notes:
                note += " | " + " ; ".join(rejected_notes[:5])
            return None, 0.0, used_query, note

        ranked.sort(key=lambda x: (x[0], x[1]), reverse=True)
        best_score, raw_title_score, region_level, region_note, best = ranked[0]

        # 지역/제목 종합 기준. 전국은 지역근거가 없어도 제목이 충분히 정확하면 허용.
        threshold = 0.72 if seed.expected_scope == "전국" else 0.76
        if best_score < threshold:
            return (
                None,
                best_score,
                used_query,
                f"매칭점수 미달(raw={raw_title_score:.2f}, region={region_note})",
            )

        no = clean_text(best.get("plcyNo"))
        if no:
            try:
                detail = self.detail(no)
                if detail:
                    # 상세 응답을 받은 뒤에도 지역을 다시 검사한다.
                    detail_region_level, detail_region_note = candidate_region_check(
                        detail, seed.expected_scope
                    )
                    if detail_region_level < 0:
                        return (
                            None,
                            best_score,
                            used_query,
                            f"상세조회 지역불일치: {detail_region_note}",
                        )
                    best = detail
                    region_note = detail_region_note
            except Exception as e:
                print(f"[API 상세 경고] {seed.name} / plcyNo={no}: {e}")

        note = (
            f"제목점수={raw_title_score:.2f}; 보정점수={best_score:.2f}; "
            f"지역검증={region_note}"
        )
        if rejected_notes:
            note += " | 제외후보=" + " ; ".join(rejected_notes[:3])

        return best, best_score, used_query, note


def xml_to_dict(elem: ET.Element) -> dict[str, Any]:
    children = list(elem)
    if not children:
        return {elem.tag: clean_text(elem.text)}
    grouped: dict[str, Any] = {}
    for child in children:
        converted = xml_to_dict(child)
        val = converted[child.tag]
        if child.tag in grouped:
            if not isinstance(grouped[child.tag], list):
                grouped[child.tag] = [grouped[child.tag]]
            grouped[child.tag].append(val)
        else:
            grouped[child.tag] = val
    return {elem.tag: grouped}


def find_policy_dicts(obj: Any) -> list[dict[str, Any]]:
    """응답 JSON/XML 중 plcyNm 또는 plcyNo가 있는 dict를 재귀적으로 찾는다."""
    found: list[dict[str, Any]] = []
    seen: set[int] = set()

    def walk(x: Any) -> None:
        if isinstance(x, dict):
            if id(x) in seen:
                return
            seen.add(id(x))
            if "plcyNm" in x or "plcyNo" in x:
                found.append(x)
            for v in x.values():
                walk(v)
        elif isinstance(x, list):
            for v in x:
                walk(v)

    walk(obj)
    # 중복 제거
    uniq: dict[str, dict[str, Any]] = {}
    for row in found:
        key = clean_text(row.get("plcyNo")) or json.dumps(row, ensure_ascii=False, sort_keys=True)
        uniq[key] = row
    return list(uniq.values())


# -----------------------------------------------------------------------------
# 공식 웹페이지/PDF 크롤링
# -----------------------------------------------------------------------------
_robots_cache: dict[str, urllib.robotparser.RobotFileParser] = {}


def robots_allowed(url: str) -> bool:
    if not RESPECT_ROBOTS:
        return True
    p = urlparse(url)
    robots_url = f"{p.scheme}://{p.netloc}/robots.txt"
    if robots_url not in _robots_cache:
        rp = urllib.robotparser.RobotFileParser()
        rp.set_url(robots_url)
        try:
            rp.read()
        except Exception:
            # robots 확인 자체가 실패하면 사이트 부하 방지를 위해 1회 직접 요청은 허용
            return True
        _robots_cache[robots_url] = rp
    try:
        return _robots_cache[robots_url].can_fetch(USER_AGENT, url)
    except Exception:
        return True


def is_official_url(url: str) -> bool:
    if not url:
        return False
    host = urlparse(url).netloc.lower().split(":")[0]
    if host.endswith(".go.kr"):
        return True
    return host in OFFICIAL_DOMAINS


def fetch_document(session: requests.Session, url: str) -> dict[str, Any]:
    if not url:
        raise ValueError("빈 URL")
    if not robots_allowed(url):
        raise PermissionError(f"robots.txt에서 크롤링을 허용하지 않음: {url}")

    r = session.get(url, timeout=REQUEST_TIMEOUT, allow_redirects=True)
    r.raise_for_status()
    time.sleep(REQUEST_DELAY_SECONDS)
    ctype = (r.headers.get("content-type") or "").lower()
    final_url = r.url

    if "pdf" in ctype or final_url.lower().endswith(".pdf"):
        reader = PdfReader(io.BytesIO(r.content))
        pages = []
        for page in reader.pages:
            try:
                pages.append(page.extract_text() or "")
            except Exception:
                continue
        text = clean_text("\n".join(pages))
        return {"url": final_url, "text": text, "anchors": [], "title": "", "kind": "pdf"}

    # requests가 apparent_encoding을 잡은 경우 한글 깨짐 방지
    if not r.encoding or r.encoding.lower() in {"iso-8859-1", "ascii"}:
        r.encoding = r.apparent_encoding or "utf-8"

    soup = BeautifulSoup(r.text, "html.parser")
    for tag in soup(["script", "style", "noscript", "svg", "canvas"]):
        tag.decompose()

    main = soup.find("main") or soup.find(id=re.compile(r"content|contents|container", re.I)) or soup.body or soup
    text = clean_text(main.get_text("\n", strip=True))
    anchors: list[tuple[str, str]] = []
    for a in main.find_all("a", href=True):
        label = clean_text(a.get_text(" ", strip=True))
        href = urljoin(final_url, a["href"])
        anchors.append((label, href))

    title = clean_text(soup.title.get_text(" ", strip=True)) if soup.title else ""
    return {"url": final_url, "text": text, "anchors": anchors, "title": title, "kind": "html"}


KNOWN_LABELS = [
    "사업명", "정책명", "지원대상", "대상자", "가입대상", "신청자격", "지원내용", "사업내용",
    "신청기간", "모집기간", "접수기간", "사업기간", "운영기간", "신청방법", "지원방법",
    "제출서류", "구비서류", "지원금액", "지원규모", "지원조건", "소득기준", "소득조건",
    "제외대상", "지원제외", "문의", "문의처", "담당부서", "담당자", "신청안내", "사업개요",
]


def text_lines(text: str) -> list[str]:
    return [clean_text(x) for x in text.splitlines() if clean_text(x)]


def extract_labeled_section(text: str, aliases: list[str], max_follow: int = 8) -> str:
    lines = text_lines(text)
    alias_norm = [norm_name(a) for a in aliases]
    out: list[str] = []

    for i, line in enumerate(lines):
        nline = norm_name(line)
        matched_alias = None
        for alias, na in zip(aliases, alias_norm):
            if na and (nline == na or nline.startswith(na)):
                matched_alias = alias
                break
        if not matched_alias:
            continue

        # 같은 줄의 '지원대상 : 내용' 형식
        m = re.match(rf"\s*{re.escape(matched_alias)}\s*[:：-]?\s*(.*)$", line)
        if m and clean_text(m.group(1)):
            out.append(clean_text(m.group(1)))

        # 뒤따르는 줄 수집. 다음 큰 라벨에서 중단.
        for j in range(i + 1, min(len(lines), i + 1 + max_follow)):
            nxt = lines[j]
            nn = norm_name(nxt)
            if any(nn == norm_name(lbl) or nn.startswith(norm_name(lbl)) for lbl in KNOWN_LABELS):
                break
            out.append(nxt)
        if out:
            break

    return as_joined(out, sep=" / ")


def extract_sentence_by_keywords(text: str, keywords: list[str], max_sentences: int = 4) -> str:
    # 줄 단위 + 마침표 단위로 보수적으로 추출
    chunks = re.split(r"[\n。]|(?<=[.!?])\s+", text)
    selected = []
    for chunk in chunks:
        c = clean_text(chunk)
        if c and any(k in c for k in keywords):
            selected.append(c)
            if len(selected) >= max_sentences:
                break
    return as_joined(selected, sep=" / ")


def extract_money(text: str) -> str:
    text = clean_text(text)
    if not text:
        return ""
    # 원, 만원, 천원, % 매칭. 너무 많은 값은 중복 제거 후 앞쪽만 보존.
    vals = re.findall(r"(?:\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(?:억\s*)?(?:천|백|십)?\s*(?:만|천)?\s*원|\d+(?:\.\d+)?\s*%", text)
    vals = [clean_text(v) for v in vals]
    uniq = []
    for v in vals:
        if v not in uniq:
            uniq.append(v)
    return ", ".join(uniq[:12])


def extract_age(text: str) -> tuple[str, str, str]:
    s = clean_text(text)
    if not s:
        return "", "", ""
    patterns = [
        r"만\s*(\d{1,2})\s*세\s*(?:이상|부터)?\s*[~～\-–—]\s*만?\s*(\d{1,2})\s*세",
        r"(\d{1,2})\s*세\s*(?:이상|부터)?\s*[~～\-–—]\s*(\d{1,2})\s*세",
        r"만\s*(\d{1,2})\s*세\s*이상.*?만\s*(\d{1,2})\s*세\s*이하",
    ]
    for p in patterns:
        m = re.search(p, s)
        if m:
            return m.group(1), m.group(2), clean_text(m.group(0))

    # 단일 최대/최소 조건
    min_m = re.search(r"만?\s*(\d{1,2})\s*세\s*이상", s)
    max_m = re.search(r"만?\s*(\d{1,2})\s*세\s*(?:이하|미만)", s)
    if min_m or max_m:
        raw = as_joined([min_m.group(0) if min_m else "", max_m.group(0) if max_m else ""])
        return min_m.group(1) if min_m else "", max_m.group(1) if max_m else "", raw
    return "", "", ""


def extract_residency_months(text: str) -> str:
    if not text:
        return ""
    m = re.search(r"(\d+)\s*년\s*(?:이상|계속|연속)", text)
    if m:
        return str(int(m.group(1)) * 12)
    m = re.search(r"(\d+)\s*개월\s*(?:이상|계속|연속)", text)
    if m:
        return m.group(1)
    return ""


def infer_scope(zip_cd: str, eligibility_text: str, expected_scope: str | None) -> tuple[str, str, str]:
    codes = re.findall(r"\b\d{5}\b", zip_cd or "")
    # 좁은 지역 우선
    if "26230" in codes:
        return REGION_CODE_MAP["26230"]
    if "26380" in codes:
        return REGION_CODE_MAP["26380"]
    if any(c.startswith("26") for c in codes):
        return "부산", "부산광역시", ""

    t = clean_text(eligibility_text)
    if "부산진구" in t:
        return "부산진구", "부산광역시", "부산진구"
    if "사하구" in t:
        return "사하구", "부산광역시", "사하구"
    if "부산광역시" in t or "부산시" in t or "부산 소재" in t or "부산지역" in t:
        return "부산", "부산광역시", ""

    # seed는 검증용 조사대상으로만 사용. API/원문이 지역조건을 직접 주지 않으면 비고에 기대값을 남기고,
    # 실제 신청범위는 전국 정책 seed인 경우에만 전국으로 확정한다.
    if expected_scope == "전국":
        return "전국", "전국", ""
    return EMPTY_UNKNOWN, EMPTY_UNKNOWN, EMPTY_UNKNOWN


def infer_target_type(text: str, hint: str | None) -> str:
    t = clean_text(text)
    found = []
    rules = [
        ("대학원생", "대학원생"),
        ("대학생", "대학생"),
        ("졸업생", "졸업생"),
        ("취업준비생", "취업준비생"),
        ("미취업", "미취업청년"),
        ("근로", "근로청년"),
        ("청년", "청년"),
    ]
    for k, label in rules:
        if k in t and label not in found:
            found.append(label)
    return ", ".join(found) if found else (hint or EMPTY_UNKNOWN)


def infer_employment(text: str) -> str:
    t = clean_text(text)
    tags = []
    for k, label in [
        ("미취업", "미취업자"), ("재직", "재직자"), ("근로", "근로자"),
        ("자영업", "자영업자"), ("소상공인", "소상공인"), ("프리랜서", "프리랜서"),
        ("일용", "일용근로자"), ("취업상태 제한없음", "제한없음"),
    ]:
        if k in t and label not in tags:
            tags.append(label)
    return ", ".join(tags)


def infer_school(text: str) -> str:
    t = clean_text(text)
    chunks = []
    for key in ["재학생", "휴학생", "졸업생", "대학생", "대학원생", "고등학생", "학력", "대학교", "대학원"]:
        if key in t:
            sentence = extract_sentence_by_keywords(t, [key], max_sentences=1)
            if sentence and sentence not in chunks:
                chunks.append(sentence)
    return as_joined(chunks[:4], sep=" / ")


def infer_special_target(text: str) -> str:
    t = clean_text(text)
    keys = ["다자녀", "지역인재", "기초생활수급자", "차상위", "한부모", "장애인", "자립준비청년", "저소득", "소상공인", "군인"]
    return ", ".join([k for k in keys if k in t])


def infer_activity_region(text: str) -> str:
    t = clean_text(text)
    # 거주 외 학교/직장 소재지를 자격으로 인정하는 문구가 명시될 때만 예
    if re.search(r"(소재\s*(대학|대학교|대학원|기업|직장)|재직.*부산|활동.*부산)", t):
        return "예"
    if "주민등록" in t or "거주" in t:
        return "확인필요"  # 거주 조건은 알지만 활동지역 대체 가능 여부는 별도 확인 필요
    return "확인필요"


def extract_apply_url(anchors: list[tuple[str, str]], source_url: str) -> str:
    scored: list[tuple[int, str]] = []
    for label, href in anchors:
        if not href.startswith("http"):
            continue
        score = 0
        if "신청" in label:
            score += 3
        if "바로가기" in label:
            score += 1
        if "접수" in label:
            score += 2
        if href == source_url:
            score -= 2
        if score > 0:
            scored.append((score, href))
    if not scored:
        return ""
    scored.sort(reverse=True)
    return scored[0][1]


def extract_phone(text: str) -> str:
    vals = re.findall(r"(?:0\d{1,2})[-)\s]?\d{3,4}[-\s]?\d{4}", text)
    uniq = []
    for v in vals:
        v = re.sub(r"\s+", "", v).replace(")", "-")
        if v not in uniq:
            uniq.append(v)
    return ", ".join(uniq[:5])


def parse_crawl(doc: dict[str, Any]) -> dict[str, str]:
    text = doc.get("text", "")
    anchors = doc.get("anchors", [])

    target = extract_labeled_section(text, ["지원대상", "대상자", "가입대상", "신청자격"], max_follow=12)
    support = extract_labeled_section(text, ["지원내용", "사업내용", "근로장려금"], max_follow=12)
    app_period = extract_labeled_section(text, ["신청기간", "모집기간", "접수기간"], max_follow=5)
    biz_period = extract_labeled_section(text, ["사업기간", "운영기간"], max_follow=5)
    method = extract_labeled_section(text, ["신청방법", "접수방법"], max_follow=6)
    income = extract_labeled_section(text, ["소득조건", "소득기준"], max_follow=8)
    exclude = extract_labeled_section(text, ["제외대상", "지원제외", "참여제한"], max_follow=8)
    amount_section = extract_labeled_section(text, ["지원금액", "지원규모", "장학금", "근로장려금"], max_follow=8)
    department = extract_labeled_section(text, ["담당부서"], max_follow=2)
    contact_section = extract_labeled_section(text, ["문의처", "문의", "담당자"], max_follow=3)
    docs = extract_labeled_section(text, ["제출서류", "구비서류"], max_follow=10)

    app_start, app_end = parse_date_range(app_period)
    biz_start, biz_end = parse_date_range(biz_period)
    age_min, age_max, age_raw = extract_age(target or text)

    residency = extract_sentence_by_keywords(target or text, ["거주", "주민등록", "주소", "소재 대학", "소재 대학교"], max_sentences=5)
    school = infer_school(target)
    employment = infer_employment(target)
    if not income:
        income = extract_sentence_by_keywords(target or text, ["소득", "중위소득", "건강보험료", "학자금 지원구간", "연매출", "총급여"], max_sentences=5)

    always = "예" if any(k in app_period for k in ["상시", "연중", "수시"]) else ("아니오" if app_start or app_end else "확인필요")
    app_url = extract_apply_url(anchors, doc.get("url", ""))
    phone = extract_phone(contact_section or text)

    return {
        "지원대상_원문": target,
        "지원내용": support,
        "지원금액": extract_money(amount_section or support),
        "연령조건_원문": age_raw,
        "최소연령": age_min,
        "최대연령": age_max,
        "거주조건_원문": residency,
        "거주기간_개월": extract_residency_months(residency),
        "활동지역인정": infer_activity_region(target),
        "취업상태": employment,
        "학력·재학조건": school,
        "소득조건": income,
        "특화대상": infer_special_target(target),
        "제외대상": exclude,
        "기타조건": as_joined([docs], sep=" / "),
        "신청시작일": app_start,
        "신청마감일": app_end,
        "운영시작일": biz_start,
        "운영종료일": biz_end,
        "상시모집": always,
        "신청방법": method,
        "신청URL": app_url,
        "문의처": first_nonempty(contact_section, phone, default=""),
        "기관 담당부서": department,
        "원문URL": doc.get("url", ""),
        "게시일": "",  # generic HTML에서 '게시일'을 안전하게 구분하기 어려우므로 추정하지 않음
    }


# -----------------------------------------------------------------------------
# API -> CSV 매핑
# -----------------------------------------------------------------------------
def api_to_partial(api: dict[str, Any], seed: PolicySeed) -> dict[str, str]:
    eligibility = as_joined([
        api.get("addAplyQlfcCndCn"),
        api.get("plcyExplnCn"),
        api.get("plcySprtCn"),
    ], sep=" / ")

    min_age = clean_text(api.get("sprtTrgtMinAge"))
    max_age = clean_text(api.get("sprtTrgtMaxAge"))
    age_raw = ""
    if min_age or max_age:
        age_raw = f"지원대상 최소연령={min_age or '미표기'}, 최대연령={max_age or '미표기'}"

    income = as_joined([
        f"소득조건구분코드={clean_text(api.get('earnCndSeCd'))}" if api.get("earnCndSeCd") else "",
        f"소득최소금액={clean_text(api.get('earnMinAmt'))}" if api.get("earnMinAmt") else "",
        f"소득최대금액={clean_text(api.get('earnMaxAmt'))}" if api.get("earnMaxAmt") else "",
        api.get("earnEtcCn"),
    ])

    app_raw = clean_text(api.get("aplyYmd"))
    app_start, app_end = parse_date_range(app_raw)
    biz_start = normalize_date_string(clean_text(api.get("bizPrdBgngYmd")))
    biz_end = normalize_date_string(clean_text(api.get("bizPrdEndYmd")))

    always = "예" if any(k in app_raw for k in ["상시", "연중", "수시"]) else ("아니오" if app_start or app_end else "확인필요")
    scope, sido, sigungu = infer_scope(clean_text(api.get("zipCd")), eligibility, seed.expected_scope)

    job_text = infer_employment(eligibility)
    school_text = infer_school(eligibility)
    special = infer_special_target(eligibility)
    residence = extract_sentence_by_keywords(eligibility, ["거주", "주민등록", "주소", "소재 대학", "소재 대학교"], max_sentences=5)

    raw_codes = {
        "zipCd": api.get("zipCd"),
        "jobCd": api.get("jobCd"),
        "schoolCd": api.get("schoolCd"),
        "plcyMajorCd": api.get("plcyMajorCd"),
        "sBizCd": api.get("sBizCd"),
        "mrgSttsCd": api.get("mrgSttsCd"),
        "aplyPrdSeCd": api.get("aplyPrdSeCd"),
    }
    raw_codes = {k: clean_text(v) for k, v in raw_codes.items() if clean_text(v)}

    return {
        "정책명": clean_text(api.get("plcyNm")),
        "신청범위": scope,
        "대상유형": infer_target_type(eligibility, seed.target_hint),
        "대상시도": sido,
        "대상시군구": sigungu,
        "시행기관": clean_text(api.get("sprvsnInstCdNm")),
        "운영기관": clean_text(api.get("operInstCdNm")),
        "지원내용": clean_text(api.get("plcySprtCn")),
        "지원금액": extract_money(clean_text(api.get("plcySprtCn"))),
        "지원대상_원문": clean_text(api.get("addAplyQlfcCndCn")),
        "연령조건_원문": age_raw,
        "최소연령": min_age,
        "최대연령": max_age,
        "거주조건_원문": residence,
        "거주기간_개월": extract_residency_months(residence),
        "활동지역인정": infer_activity_region(eligibility),
        "취업상태": job_text,
        "학력·재학조건": school_text,
        "소득조건": income,
        "특화대상": special,
        "제외대상": clean_text(api.get("ptcpPrpTrgtCn")),
        "기타조건": as_joined([api.get("etcMttrCn"), f"원시코드={json.dumps(raw_codes, ensure_ascii=False)}" if raw_codes else ""]),
        "신청시작일": app_start,
        "신청마감일": app_end,
        "운영시작일": biz_start,
        "운영종료일": biz_end,
        "상시모집": always,
        "신청방법": clean_text(api.get("plcyAplyMthdCn")),
        "신청URL": clean_text(api.get("aplyUrlAddr")),
        "원문URL": first_nonempty(api.get("refUrlAddr1"), api.get("refUrlAddr2"), default=""),
        "요약": clean_text(api.get("plcyExplnCn")),
    }


def merge_fill(row: dict[str, str], data: dict[str, str], overwrite: bool = False) -> None:
    """빈 값/확인필요만 채운다. overwrite=True면 검증된 공식 원문 크롤링 값을 우선."""
    for k, v in data.items():
        if k not in row:
            continue
        v = clean_text(v)
        if not v:
            continue
        if overwrite or row[k] in {"", EMPTY_UNKNOWN}:
            row[k] = v


def finalize_row(row: dict[str, str], seed: PolicySeed, api_obj: dict[str, Any] | None, match_score: float, method: list[str]) -> dict[str, str]:
    # 고정 메타데이터
    row["데이터유형"] = "정책_혜택"
    row["대분류"] = "장학·금융"
    row["세부분류"] = seed.subclass
    row["추가태그"] = ", ".join(seed.tags) if seed.tags else EMPTY_UNKNOWN
    row["팀 조사담당자"] = os.getenv("TEAM_MEMBER", "서여경")
    row["수집일"] = TODAY.isoformat()
    row["최종확인일"] = TODAY.isoformat()
    row["수집방식"] = "+".join(method) if method else EMPTY_UNKNOWN

    if row["정책명"] in {"", EMPTY_UNKNOWN}:
        row["정책명"] = seed.name

    if row["대상유형"] in {"", EMPTY_UNKNOWN} and seed.target_hint:
        row["대상유형"] = seed.target_hint

    # 원문으로 범위를 다시 확인. 전국 seed는 범위가 명백한 중앙사업일 때만 seed 보완.
    scope_text = as_joined([row.get("지원대상_원문"), row.get("거주조건_원문"), row.get("학력·재학조건")])
    s, sido, sigungu = infer_scope(
        clean_text(api_obj.get("zipCd")) if api_obj else "",
        scope_text,
        seed.expected_scope,
    )
    if s != EMPTY_UNKNOWN:
        row["신청범위"], row["대상시도"], row["대상시군구"] = s, sido, sigungu
    elif seed.expected_scope and row["신청범위"] in {"", EMPTY_UNKNOWN}:
        # 전국 외 지역은 추정하지 않고 확인필요 유지
        if seed.expected_scope == "전국":
            row["신청범위"], row["대상시도"], row["대상시군구"] = "전국", "전국", ""

    if seed.apply_url and row["신청URL"] in {"", EMPTY_UNKNOWN}:
        row["신청URL"] = seed.apply_url

    if seed.official_url and row["원문URL"] in {"", EMPTY_UNKNOWN}:
        row["원문URL"] = seed.official_url

    # 상태 계산
    row["진행상태"] = calc_status(
        "" if row["신청시작일"] == EMPTY_UNKNOWN else row["신청시작일"],
        "" if row["신청마감일"] == EMPTY_UNKNOWN else row["신청마감일"],
        row["상시모집"],
    )

    api_no = clean_text(api_obj.get("plcyNo")) if api_obj else ""
    row["data_id"] = stable_id(row["정책명"], row["원문URL"], api_no)

    notes = []
    if api_obj:
        notes.append(f"온통청년API 매칭점수={match_score:.2f}")
    else:
        notes.append("온통청년API에서 신뢰 가능한 동일 정책 미확인")
    if seed.expected_scope and row["신청범위"] == EMPTY_UNKNOWN:
        notes.append(f"조사대상 기대범위={seed.expected_scope}; 원문/API에서 재검증 필요")
    if row["원문URL"] != EMPTY_UNKNOWN and not is_official_url(row["원문URL"]):
        notes.append("원문URL이 허용된 공식 도메인 목록 밖임: 시행기관 원문 재확인 필요")
    row["비고"] = as_joined([row.get("비고"), *notes]) or EMPTY_UNKNOWN

    # 입력규칙: 빈 칸은 확인필요로 통일하되, 대상시군구는 전국/부산 광역 단위에서 공란이 의미 있음
    for col in OUTPUT_COLUMNS:
        if row[col] == "":
            if col == "대상시군구" and row.get("신청범위") in {"전국", "부산"}:
                row[col] = NO_LIMIT
            else:
                row[col] = EMPTY_UNKNOWN
    return row


# -----------------------------------------------------------------------------
# 수집 파이프라인
# -----------------------------------------------------------------------------
def collect_one(seed: PolicySeed, api: YouthPolicyAPI | None, session: requests.Session) -> tuple[dict[str, str], dict[str, Any]]:
    row = blank_row()
    method: list[str] = []
    api_obj: dict[str, Any] | None = None
    match_score = 0.0
    api_query_used = ""
    api_match_note = ""
    errors: list[str] = []

    # 1) 온통청년 API 우선 검색
    if api:
        try:
            api_obj, match_score, api_query_used, api_match_note = api.find_best(seed)
            if api_obj:
                merge_fill(row, api_to_partial(api_obj, seed), overwrite=False)
                method.append("API")
        except Exception as e:
            errors.append(f"API 오류: {e}")

    # 2) 공식 원문 URL 결정: API refUrl > seed official_url
    crawl_urls: list[str] = []
    if api_obj:
        for k in ("refUrlAddr1", "refUrlAddr2"):
            u = clean_text(api_obj.get(k))
            if (
                u
                and is_official_url(u)
                and url_region_compatible(u, seed.expected_scope)
                and u not in crawl_urls
            ):
                crawl_urls.append(u)
            elif u and is_official_url(u) and not url_region_compatible(u, seed.expected_scope):
                errors.append(f"API 참고URL 지역불일치로 제외: {u}")
    if seed.official_url and is_official_url(seed.official_url) and seed.official_url not in crawl_urls:
        crawl_urls.append(seed.official_url)

    # 3) 공식 사이트 크롤링: API에서 누락될 수 있는 신청기간/원문조건/담당부서 등을 보완
    crawled_docs = []
    for url in crawl_urls[:2]:  # 정책당 최대 2개 공식 원문만 확인해 과도한 요청 방지
        try:
            doc = fetch_document(session, url)
            parsed = parse_crawl(doc)
            # 공식 원문에서 명시적으로 잡힌 값은 API의 요약 필드보다 우선할 수 있음
            merge_fill(row, parsed, overwrite=False)
            crawled_docs.append(doc)
            if "크롤링" not in method:
                method.append("크롤링")
        except Exception as e:
            errors.append(f"크롤링 오류 {url}: {e}")

    # seed 적용 URL은 fallback
    if seed.apply_url and row["신청URL"] in {"", EMPTY_UNKNOWN}:
        row["신청URL"] = seed.apply_url

    row = finalize_row(row, seed, api_obj, match_score, method)
    if errors:
        row["비고"] = as_joined([row["비고"], *errors])

    debug = {
        "seed": seed.name,
        "api_query_used": api_query_used,
        "api_match_score": match_score,
        "api_plcyNo": clean_text(api_obj.get("plcyNo")) if api_obj else "",
        "api_plcyNm": clean_text(api_obj.get("plcyNm")) if api_obj else "",
        "api_match_note": api_match_note,
        "crawl_urls": [d.get("url") for d in crawled_docs],
        "errors": errors,
        "method": method,
    }
    return row, debug


def dedupe_rows(rows: list[dict[str, str]]) -> list[dict[str, str]]:
    """정책명+시행기관+신청기간 기준 중복 제거. 정보가 많은 행을 우선."""
    groups: dict[tuple[str, str, str, str], dict[str, str]] = {}

    def richness(r: dict[str, str]) -> int:
        return sum(1 for v in r.values() if v not in {"", EMPTY_UNKNOWN, NO_LIMIT})

    for r in rows:
        key = (
            norm_name(r["정책명"]),
            norm_name(r["시행기관"]),
            r["신청시작일"],
            r["신청마감일"],
        )
        old = groups.get(key)
        if old is None or richness(r) > richness(old):
            groups[key] = r
    return list(groups.values())


def write_csv(path: Path, rows: list[dict[str, Any]], fieldnames: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        w.writeheader()
        for row in rows:
            w.writerow({k: row.get(k, "") for k in fieldnames})


def make_search_plan() -> list[dict[str, str]]:
    rows = []
    for seed in POLICY_SEEDS:
        rows.append({
            "정책명": seed.name,
            "조사범위_기대값": seed.expected_scope or EMPTY_UNKNOWN,
            "온통청년_API_검색어": " | ".join(seed.api_queries),
            "공식_우선확인_URL": seed.official_url or EMPTY_UNKNOWN,
            "세부분류": seed.subclass,
            "태그": ", ".join(seed.tags),
        })
    return rows


def unresolved_from(rows: list[dict[str, str]]) -> list[dict[str, str]]:
    important = [
        "신청범위", "시행기관", "지원내용", "지원대상_원문", "신청시작일", "신청마감일",
        "신청URL", "원문URL",
    ]
    out = []
    for r in rows:
        missing = [c for c in important if r.get(c) in {"", EMPTY_UNKNOWN}]
        if missing:
            out.append({
                "data_id": r["data_id"],
                "정책명": r["정책명"],
                "확인필요_항목": ", ".join(missing),
                "비고": r["비고"],
                "원문URL": r["원문URL"],
            })
    return out


def sources_from(rows: list[dict[str, str]]) -> list[dict[str, str]]:
    out = []
    seen = set()
    for r in rows:
        key = (r["정책명"], r["원문URL"])
        if key in seen:
            continue
        seen.add(key)
        out.append({
            "정책명": r["정책명"],
            "원문URL": r["원문URL"],
            "신청URL": r["신청URL"],
            "수집방식": r["수집방식"],
            "최종확인일": r["최종확인일"],
        })
    return out


def main() -> None:
    load_dotenv()
    parser = argparse.ArgumentParser(description="부산 청년 AI 생활·혜택 안내 서비스 - 장학·금융 정책 수집기 (온통청년 API별 키 지원)")
    parser.add_argument("--out-dir", default="output", help="CSV 출력 폴더 (기본: output)")
    parser.add_argument("--no-api", action="store_true", help="온통청년 API 호출 없이 공식 URL만 크롤링")
    parser.add_argument("--only", default="", help="정책명 일부 문자열. 해당 seed만 수집")
    args = parser.parse_args()

    out_dir = Path(args.out_dir)
    session = requests.Session()
    session.headers.update({
        "User-Agent": USER_AGENT,
        "Accept": "application/json,text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.6",
    })

    # 온통청년 API 종류별 키 로드
    api_keys = load_youthcenter_api_keys()
    print_api_key_status(api_keys)

    # 이 파일은 장학·금융 정책 수집기이므로 실제 정책 검색에는 청년정책API 키를 사용한다.
    # 나머지 5개 키는 동일 프로젝트의 콘텐츠/센터/기본계획 수집기에서 재사용한다.
    policy_api_key = api_keys.get("policy", "")
    api: YouthPolicyAPI | None = None
    if not args.no_api:
        if policy_api_key:
            api = YouthPolicyAPI(policy_api_key, session)
        else:
            print(
                "[안내] YOUTHCENTER_POLICY_API_KEY가 없어 청년정책 API는 건너뜁니다. "
                "(.env의 전용 키 또는 호환용 YOUTHCENTER_API_KEY를 확인하세요.)"
            )

    seeds = POLICY_SEEDS
    if args.only:
        seeds = [s for s in seeds if args.only in s.name]
        if not seeds:
            raise SystemExit(f"--only={args.only!r} 에 해당하는 정책 seed가 없습니다.")

    # 0) 공식 사이트/검색 키워드 목록 먼저 저장
    plan = [x for x in make_search_plan() if any(x["정책명"] == s.name for s in seeds)]
    write_csv(
        out_dir / "00_공식사이트_검색키워드.csv",
        plan,
        ["정책명", "조사범위_기대값", "온통청년_API_검색어", "공식_우선확인_URL", "세부분류", "태그"],
    )

    results = []
    logs = []
    for idx, seed in enumerate(seeds, 1):
        print(f"[{idx}/{len(seeds)}] 수집: {seed.name}")
        row, log = collect_one(seed, api, session)
        results.append(row)
        logs.append(log)

    results = dedupe_rows(results)

    write_csv(out_dir / "01_장학금융_정책수집결과.csv", results, OUTPUT_COLUMNS)
    write_csv(
        out_dir / "02_공식출처목록.csv",
        sources_from(results),
        ["정책명", "원문URL", "신청URL", "수집방식", "최종확인일"],
    )
    write_csv(
        out_dir / "03_확인필요항목.csv",
        unresolved_from(results),
        ["data_id", "정책명", "확인필요_항목", "비고", "원문URL"],
    )
    write_csv(
        out_dir / "04_수집로그.csv",
        [
            {
                "정책명": x["seed"],
                "API검색어": x["api_query_used"],
                "API매칭점수": f"{x['api_match_score']:.2f}",
                "API정책번호": x["api_plcyNo"],
                "API정책명": x["api_plcyNm"],
                "API매칭검증": x.get("api_match_note", ""),
                "크롤링URL": " | ".join(x["crawl_urls"]),
                "수집방식": "+".join(x["method"]),
                "오류": " | ".join(x["errors"]),
            }
            for x in logs
        ],
        ["정책명", "API검색어", "API매칭점수", "API정책번호", "API정책명", "API매칭검증", "크롤링URL", "수집방식", "오류"],
    )

    print("\n완료")
    print(f"- {out_dir / '00_공식사이트_검색키워드.csv'}")
    print(f"- {out_dir / '01_장학금융_정책수집결과.csv'}")
    print(f"- {out_dir / '02_공식출처목록.csv'}")
    print(f"- {out_dir / '03_확인필요항목.csv'}")
    print(f"- {out_dir / '04_수집로그.csv'}")


if __name__ == "__main__":
    main()
