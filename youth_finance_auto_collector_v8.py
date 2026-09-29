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
from urllib.parse import urljoin, urlparse, urldefrag
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
    "BusanYouthPolicyResearchBot/1.6 "
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
    "청년대상구분",
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

# -----------------------------------------------------------------------------
# 자동 탐색 설정
# -----------------------------------------------------------------------------
# 기존처럼 12개 정책명을 고정 검색하지 않고, 아래 장학·금융 키워드로
# 온통청년 청년정책API의 후보를 폭넓게 수집한 뒤 지역/내용을 다시 검증한다.
DISCOVERY_NAME_TERMS = [
    "장학", "학자금", "대출", "이자지원", "저축", "적금", "통장",
    "자산형성", "금융", "신용회복", "등록금", "융자", "보증", "장려금",
]
DISCOVERY_KEYWORD_TERMS = [
    "장학금", "학자금", "자산형성", "금융", "저축", "대출",
]

FINANCE_TITLE_KEYWORDS = [
    "장학", "학자금", "등록금", "학비", "대출", "융자", "이자",
    "저축", "적금", "통장", "자산형성", "금융", "신용회복", "채무",
    "보증", "장려금", "생활비", "학업보조",
]
FINANCE_TEXT_KEYWORDS = [
    "장학금", "학자금", "등록금", "대출", "대출이자", "이자 지원",
    "저축", "정부기여금", "매칭", "자산형성", "신용회복", "융자",
    "보증료", "금융지원", "생활장학금", "학업보조비",
]

TARGET_SCOPES = {"전국", "부산", "부산진구", "사하구"}

# 온통청년 API에 누락되거나 지역 자체 사이트에서만 안내되는 부산 정책을
# 보완하기 위한 공식 인덱스. 페이지의 각 행에서 금융·장학 사업 링크를 자동 발견한다.
LOCAL_INDEX_SOURCES = [
    ("부산", "https://young.busan.go.kr/index.nm?menuCd=195"),
]

CENTRAL_NATIONAL_DOMAINS = {
    "www.kosaf.go.kr", "kosaf.go.kr",
    "www.bokjiro.go.kr", "bokjiro.go.kr",
    "www.fsc.go.kr", "fsc.go.kr",
    "www.kinfa.or.kr", "kinfa.or.kr",
    "www.youthcenter.go.kr", "youthcenter.go.kr",
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
    "busanjinsf.kr",
    "www.busanjinsf.kr",
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


SUPPLEMENTAL_POLICY_SEEDS: list[PolicySeed] = [
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
        official_url="https://busanjinsf.kr/",
        expected_scope="부산진구",
        subclass="장학금",
        tags=["부산진구", "대학생", "장학금"],
        target_hint="대학생",
        aliases=["부산진구장학회 대학생 장학금", "부산진구장학회 장학금"],
    ),
    PolicySeed(
        name="(재)사하구장학회 저소득 대학생 장학",
        api_queries=["사하구장학회", "사하구 장학금", "사하구 저소득 대학생 장학"],
        official_url="https://friend.saha.go.kr/portal/contents.do?mId=0507040000",
        expected_scope="사하구",
        subclass="장학금",
        tags=["사하구", "저소득", "자립준비청년", "대학생"],
        target_hint="저소득 대학생·자립준비청년",
        aliases=["사하구장학회 저소득 대학생 장학", "사하구장학회 장학금"],
    ),
]


# -----------------------------------------------------------------------------
# 사전 검증값(Curated fallback)
# -----------------------------------------------------------------------------
# API/크롤링으로 끝까지 확인하지 못한 값만 보완한다.
# - 기존에 수집된 값은 덮어쓰지 않는다.
# - 사용자가 검증표에서 '공식자료 미표기'라고 정리한 항목은 숫자/조건을 추정하지 않는다.
# - 따라서 최소/최대연령처럼 정규화 값이 불명확한 경우에는 원문 설명만 채우고
#   정규화 칸은 계속 '확인필요'로 남길 수 있다.
# - '해당없음'은 자동 생성하지 않는다.
# - 정확한 신청 시작/마감일이 있는 정책은 아래 날짜를 채운 뒤 calc_status()가
#   실행 시점(TODAY)을 기준으로 모집예정/모집중/마감을 자동 계산한다.
# 시행기관은 사전값으로 추정하지 않는다.
# API/공식 원문 크롤링에서 실제로 확인된 경우에만 채우고,
# 끝까지 확인되지 않으면 '확인필요'로 남긴다.
#
# 반면 아래 국가 장학·학자금 사업은 실제 신청/업무 운영 주체로
# 한국장학재단을 운영기관 fallback으로만 사용한다.
CURATED_OPERATING_AGENCY: dict[str, str] = {
    "국가장학금Ⅰ유형": "한국장학재단",
    "다자녀 국가장학금": "한국장학재단",
    "국가근로장학금": "한국장학재단",
    "일반 상환 학자금대출": "한국장학재단",
    "취업 후 상환 학자금대출": "한국장학재단",
}


CURATED_FALLBACKS: dict[str, dict[str, Any]] = {
    "국가장학금Ⅰ유형": {
        "fields": {
            "거주조건_원문": "지역 거주조건 공식자료 미표기 / 대한민국 국적·국내대학 기준",
            "학력·재학조건": "국내대학 신입·편입·재입학·복학·재학생 등",
            "취업상태": "취업상태 조건 공식자료 미표기",
            "소득조건": "학자금 지원구간 9구간 이하",
            "지원대상_원문": "대한민국 국적을 소지하고 국내대학 신입·편입·재입학·복학·재학생 등 / 학자금 지원구간 9구간 이하",
            "지원내용": "2026년 기준 기초·차상위 등록금 전액 / 1~3구간 연 최대 600만원 / 4~6구간 440만원 / 7~8구간 360만원 / 9구간 100만원",
            "지원금액": "기초·차상위 등록금 전액 / 1~3구간 연 최대 600만원 / 4~6구간 440만원 / 7~8구간 360만원 / 9구간 100만원",
            "연령조건_원문": "공식자료에 별도 연령조건 미표기",
            "신청시작일": "2026-08-12",
            "신청마감일": "2026-09-09",
            "상시모집": "아니오",
            "신청URL": "https://www.kosaf.go.kr/ko/scholar.do?pg=scholarship05_12_01_01_02p",
        },
        "source_note": "검증표: 한국장학재단 2026 국가장학금Ⅰ유형 안내",
    },
    "다자녀 국가장학금": {
        "fields": {
            "거주조건_원문": "지역 거주조건 공식자료 미표기 / 대한민국 국적 기준",
            "학력·재학조건": "국내대학 재학생 등 / 대한민국 국적 자녀 3명 이상 가정의 미혼 대학생",
            "취업상태": "취업상태 조건 공식자료 미표기",
            "소득조건": "학자금 지원구간 9구간 이하",
            "특화대상": "다자녀",
            "지원대상_원문": "대한민국 국적 자녀 3명 이상 가정의 미혼 대학생 / 국내대학 재학생 등 / 학자금 지원구간 9구간 이하",
            "지원내용": "기초·차상위 등록금 전액 / 첫째·둘째: 1~3구간 연 610만원, 4~6구간 505만원, 7~8구간 465만원, 9구간 135만원 / 셋째 이상: 1~8구간 전액, 9구간 연 200만원",
            "지원금액": "기초·차상위 등록금 전액 / 첫째·둘째: 1~3구간 연 610만원, 4~6구간 505만원, 7~8구간 465만원, 9구간 135만원 / 셋째 이상: 1~8구간 전액, 9구간 연 200만원",
            "연령조건_원문": "조건부 만 39세 기준",
            "신청시작일": "2026-08-12",
            "신청마감일": "2026-09-09",
            "상시모집": "아니오",
            "신청URL": "https://www.kosaf.go.kr/ko/scholar.do?pg=scholarship05_12_10",
        },
        "source_note": "검증표: 한국장학재단 2026 다자녀 국가장학금 안내",
    },
    "국가근로장학금": {
        "fields": {
            "거주조건_원문": "지역 거주조건 공식자료 미표기 / 참여대학 소속 기준",
            "학력·재학조건": "국가근로 참여대학 재학생 등",
            "취업상태": "별도 취업상태 조건 공식자료 미표기",
            "소득조건": "원칙적으로 학자금 지원구간 9구간 이하",
            "지원대상_원문": "국가근로 참여대학 재학생 등 / 원칙적으로 학자금 지원구간 9구간 이하",
            "지원내용": "2026년 시급 교내 10,320원 / 교외 12,790원",
            "지원금액": "교내 시급 10,320원 / 교외 시급 12,790원",
            "연령조건_원문": "공식자료에 별도 연령조건 미표기",
            "신청시작일": "2026-08-12",
            "신청마감일": "2026-09-09",
            "상시모집": "아니오",
            "신청URL": "https://www.kosaf.go.kr/ko/scholar.do?pg=scholarship05_04_01&ttab1=4",
        },
        "source_note": "검증표: 한국장학재단 2026 국가근로장학금 안내",
    },
    "일반 상환 학자금대출": {
        "fields": {
            "거주조건_원문": "지역 거주조건 공식자료 미표기 / 국내 고등교육기관 대상",
            "학력·재학조건": "학부생·전문기술석사·대학원생 / 재학생 및 입학·복학예정자 포함",
            "취업상태": "취업상태 조건 공식자료 미표기",
            "소득조건": "학부생·대학원생 학자금 지원구간 제한 없음",
            "지원대상_원문": "국내 고등교육기관 학부생·전문기술석사·대학원생 / 재학생 및 입학·복학예정자 포함",
            "지원내용": "등록금은 해당학기 등록금 소요액 범위 / 생활비는 학기당 최대 200만원",
            "지원금액": "등록금: 해당학기 등록금 소요액 범위 / 생활비: 학기당 최대 200만원",
            "연령조건_원문": "만 55세 이하",
            "최대연령": "55",
            "신청시작일": "2026-07-01",
            "신청마감일": "2026-11-17",
            "상시모집": "아니오",
            "신청URL": "https://www.kosaf.go.kr/ko/tuition.do?pg=tuition04_02_01&ttab1=0",
        },
        "source_note": "검증표: 한국장학재단 일반 상환 학자금대출 안내",
    },
    "취업 후 상환 학자금대출": {
        "fields": {
            "거주조건_원문": "지역 거주조건 공식자료 미표기 / 국내 협약 고등교육기관 기준",
            "학력·재학조건": "학부생·대학원생·전문기술석사 등",
            "취업상태": "신청 당시 취업 필수 조건 없음 / 향후 소득 발생 시 상환",
            "소득조건": "등록금: 지원구간 무관 / 생활비: 학부 8구간 이하 또는 9구간 중 긴급생계곤란자, 대학원 6구간 이하 등",
            "지원대상_원문": "국내 협약 고등교육기관 학부생·대학원생·전문기술석사 등",
            "지원내용": "등록금 대출 + 생활비 학기당 최대 200만원",
            "지원금액": "등록금 대출 / 생활비 학기당 최대 200만원",
            "연령조건_원문": "학부 만 35세 / 대학원 만 40세",
            "신청시작일": "2026-07-01",
            "신청마감일": "2026-11-17",
            "상시모집": "아니오",
            "신청URL": "https://www.kosaf.go.kr/ko/tuition.do?naviParam=HD&pg=tuition04_01_01",
        },
        "source_note": "검증표: 한국장학재단 취업 후 상환 학자금대출 안내",
    },
    "청년내일저축계좌": {
        "fields": {
            "최소연령": "15",
            "최대연령": "39",
            "연령조건_원문": "만 15세~39세",
            "거주조건_원문": "전국 / 주소지 관할 행정복지센터 또는 복지로 신청",
            "학력·재학조건": "학적 조건 공식자료 미표기",
            "취업상태": "근로·사업소득 발생 필요",
            "소득조건": "월 근로·사업소득 10만원 이상 + 가구 소득인정액 기준중위소득 50% 이하",
            "지원대상_원문": "만 15세~39세 / 근로·사업소득 발생 / 월 근로·사업소득 10만원 이상 / 가구 소득인정액 기준중위소득 50% 이하",
            "지원내용": "본인 월 10~50만원 저축 시 정부 월 30만원 지원 / 본인 월 10만원 기준 3년 만기 총 1,440만원 + 이자",
            "지원금액": "정부 월 30만원 지원 / 본인 월 10만원 기준 3년 만기 총 1,440만원 + 이자",
            "신청시작일": "2026-05-04",
            "신청마감일": "2026-05-20",
            "상시모집": "아니오",
            "신청URL": "https://www.bokjiro.go.kr/ssis-tbu/twataa/wlfareInfo/moveTWAT52011M.do?wlfareInfoId=WLF00000060&wlfareInfoReldBztpCd=01",
        },
        "source_note": "검증표: 복지로 2026 청년내일저축계좌 신청 안내",
    },
    "청년미래적금": {
        "fields": {
            "최소연령": "19",
            "최대연령": "34",
            "연령조건_원문": "만 19세~34세",
            "거주조건_원문": "지역 거주조건 없음 / 전국 취급기관 이용",
            "거주기간_개월": "제한없음",
            "학력·재학조건": "학적 조건 공식자료 미표기",
            "취업상태": "취업상태 자체보다 소득요건 적용",
            "소득조건": "총급여 7,500만원 이하 소득자 또는 연매출 3억원 이하 소상공인 + 가구 중위소득 200% 이하 등",
            "지원대상_원문": "만 19세~34세 / 총급여 7,500만원 이하 소득자 또는 연매출 3억원 이하 소상공인 / 가구 중위소득 200% 이하 등",
            "지원내용": "월 1천원~50만원 자유납입 / 3년 / 정부기여금 일반형 6%, 우대형 12% + 이자소득 비과세",
            "지원금액": "정부기여금 일반형 6%, 우대형 12% + 이자소득 비과세",
            "신청시작일": "2026-10-07",
            "신청마감일": "2026-10-16",
            "상시모집": "아니오",
            "신청방법": "취급 금융기관 앱·웹에서 신청",
            "신청URL": "취급 금융기관별 앱·웹",
        },
        "source_note": "검증표: 금융위원회 청년미래적금 2차 모집 안내",
    },
    "부산지역인재 장학금": {
        "fields": {
            "거주조건_원문": "거주지가 아니라 부산 소재 대학 소속 조건",
            "활동지역인정": "예",
            "학력·재학조건": "부산 소재 대학 IT·상경 분야 재학생 / 일반대 3·4학년, 전문대 2학년 등 세부조건",
            "취업상태": "취업상태 조건 공식자료 미표기",
            "소득조건": "한국장학재단 학자금 지원구간 9구간 이하",
            "특화대상": "지역인재",
            "지원대상_원문": "부산 소재 대학 IT·상경 분야 재학생 / 일반대 3·4학년, 전문대 2학년 등 / 학자금 지원구간 9구간 이하",
            "지원내용": "1인 150만원 생활장학금",
            "지원금액": "1인 150만원",
            "연령조건_원문": "공식자료에 별도 연령조건 미표기",
            "신청시작일": "2026-06-30",
            "신청마감일": "2026-07-14",
            "상시모집": "아니오",
            "신청URL": "https://young.busan.go.kr/index.nm?menuCd=164",
        },
        "source_note": "검증표: 부산청년플랫폼 부산지역인재 장학금 안내",
    },
    "부산광역시 대학(원)생 학자금대출 이자지원": {
        "fields": {
            "거주조건_원문": "재·휴학생: 부산 소재 대학(원) / 졸업생: 부산 소재 대학 졸업 후 2년 이내 + 주민등록상 부산 거주",
            "활동지역인정": "예",
            "학력·재학조건": "대학·대학원 재·휴학생 / 조건 충족 대학교 졸업생",
            "취업상태": "재·휴학생 별도 조건 공식자료 미표기 / 졸업생은 미취업자",
            "소득조건": "신청 자격의 정액 소득기준 공식자료 미표기 / 신청액이 예산 초과 시 저소득분위 우선·소득분위별 조정 가능",
            "지원대상_원문": "부산 소재 대학(원) 재·휴학생 / 부산 소재 대학 졸업 후 2년 이내이며 주민등록상 부산 거주하는 미취업 졸업생",
            "지원내용": "한국장학재단 학자금대출의 2025.7~2026.6 발생이자 지원",
            "지원금액": "한국장학재단 학자금대출의 2025.7~2026.6 발생이자 지원",
            "연령조건_원문": "공식자료에 별도 연령조건 미표기",
            "신청시작일": "2026-07-06",
            "신청마감일": "2026-08-28",
            "상시모집": "아니오",
            "신청URL": "https://young.busan.go.kr/index.nm?menuCd=49",
        },
        "source_note": "검증표: 부산광역시 2026 대학(원)생 학자금대출 이자지원 공고",
    },
    "부산청년 기쁨두배통장": {
        "fields": {
            "최소연령": "18",
            "최대연령": "39",
            "연령조건_원문": "18세~39세",
            "거주조건_원문": "공고일 기준 주민등록상 부산광역시 거주",
            "학력·재학조건": "학적 조건 공식자료 미표기",
            "취업상태": "근로 중인 자: 직장인·자영업자·요건 충족 일용직",
            "소득조건": "본인 기준중위소득 150% 이하",
            "지원대상_원문": "18세~39세 / 공고일 기준 주민등록상 부산광역시 거주 / 근로 중인 자 / 본인 기준중위소득 150% 이하",
            "지원내용": "월 10만원 저축 시 부산시가 1:1 매칭 지원",
            "지원금액": "월 10만원 저축 시 부산시 1:1 매칭 지원",
            "신청시작일": "2026-08-10",
            "신청마감일": "2026-08-21",
            "상시모집": "아니오",
            "신청URL": "https://www.boogi2.kr/",
        },
        "source_note": "검증표: 부산광역시 2026 부산청년 기쁨두배통장 모집 공고",
    },
    "(재)사하구장학회 저소득 대학생 장학": {
        "fields": {
            "거주조건_원문": "세대주 또는 보호자가 사하구에 신청일 현재 1년 이상 계속 거주",
            "거주기간_개월": "12",
            "학력·재학조건": "자립준비청년 등 저소득 대학생 포함",
            "취업상태": "취업상태 조건 공식자료 미표기",
            "소득조건": "시행세칙상 '생활이 어려운', '저소득 대학생'으로 규정 / 구체적 소득금액 기준 공식자료 미표기",
            "특화대상": "저소득, 자립준비청년",
            "지원대상_원문": "세대주 또는 보호자가 사하구에 신청일 현재 1년 이상 계속 거주 / 자립준비청년 등 저소득 대학생",
            "지원내용": "연간 학업보조비를 원칙으로 하며 수익·이사회 결정에 따라 지급",
            "지원금액": "정액 공식자료 미표기 / 연간 학업보조비를 원칙으로 하며 수익·이사회 결정에 따라 지급",
            "연령조건_원문": "공식자료에 별도 연령조건 미표기",
            "신청방법": "온라인 신청 없음 — 복지정책과장·동장 등 추천·서류 제출 방식",
            "신청URL": "온라인 신청 없음",
            "기타조건": "매년 장학금 지급 기준일 35일 전까지 추천·신청(일정조정 가능); 정확한 당해연도 시작·마감일은 별도 공고 확인 필요",
        },
        "source_note": "검증표: 사하구장학회 공식 시행세칙",
    },
    "(재)부산진구장학회 대학생 장학금": {
        "fields": {
            "거주조건_원문": "보호자가 부산진구에 공고일 현재 3년 이상 계속 거주",
            "거주기간_개월": "36",
            "학력·재학조건": "전문대·4년제 대학생 / 2025년도 기준 1·2·3학년, 입학예정자 포함 / 재학생 평균성적 3.5/4.5 이상",
            "취업상태": "취업상태 조건 공식자료 미표기",
            "소득조건": "전국 가구 월평균소득(4인 기준) 이상인 자 제외 / 부모 부동산 3억5천만원 이상 소유자 제외",
            "제외대상": "전국 가구 월평균소득(4인 기준) 이상인 자 / 부모 부동산 3억5천만원 이상 소유자",
            "지원대상_원문": "보호자가 부산진구에 공고일 현재 3년 이상 계속 거주 / 전문대·4년제 대학생 / 재학생 평균성적 3.5/4.5 이상 등",
            "지원내용": "일반 대학생 350만원 / 지역인재 대학생 500만원",
            "지원금액": "일반 대학생 350만원 / 지역인재 대학생 500만원",
            "연령조건_원문": "공식자료에 별도 연령조건 미표기",
            "신청시작일": "2026-01-05",
            "신청마감일": "2026-01-16",
            "상시모집": "아니오",
            "신청방법": "온라인 신청 없음 — 부산진구장학회 사무국 방문접수",
            "신청URL": "온라인 신청 없음",
        },
        "source_note": "검증표 보조 게시본: https://ribs.inu.ac.kr/bbs/inu/2006/417138/artclView.do",
    },
}


def apply_curated_fallback(
    row: dict[str, str],
    seed: PolicySeed,
) -> tuple[list[str], str]:
    """
    API/크롤링으로 확인하지 못한 값만 사전 검증표로 보완한다.

    반환:
      - 실제로 채운 필드명 목록
      - 검증표 출처/설명 메모

    주의:
      - 이미 API/공식 원문에서 값이 들어온 필드는 절대 덮어쓰지 않는다.
      - 빈 값을 '해당없음'으로 추정하지 않는다.
      - 표 자체가 '공식자료 미표기'라고 한 경우에는 그 사실을 설명하는
        원문형 텍스트 필드만 채우며, 숫자형 정규화 값은 추정하지 않는다.
    """
    item = CURATED_FALLBACKS.get(seed.name, {})
    fields = item.get("fields", {})
    filled: list[str] = []

    # 1) 정책별 검증표 필드 보완
    for key, value in fields.items():
        if key not in row:
            continue
        value = clean_text(value)
        if not value:
            continue
        if row.get(key) in {"", EMPTY_UNKNOWN}:
            row[key] = value
            filled.append(key)

    # 2) 시행기관은 curated fallback으로 채우지 않는다.
    #    API/공식 원문에서 실제로 확인된 경우만 유지하고, 없으면 확인필요로 남긴다.

    # 3) 국가 장학·학자금 사업은 한국장학재단을 운영기관 fallback으로만 사용한다.
    #    API/크롤링에서 운영기관이 이미 확인된 경우에는 덮어쓰지 않는다.
    operating_agency = clean_text(CURATED_OPERATING_AGENCY.get(seed.name))
    if operating_agency and row.get("운영기관") in {"", EMPTY_UNKNOWN}:
        row["운영기관"] = operating_agency
        if "운영기관" not in filled:
            filled.append("운영기관")

    note = clean_text(item.get("source_note"))
    if operating_agency:
        note = as_joined([note, f"운영기관 검증값={operating_agency}"])

    return filled, note


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
    """
    실제로 확인되지 않은 값은 기본적으로 '확인필요'로 둔다.

    중요:
    - 값이 없다는 이유만으로 '해당없음' 또는 '제한없음'을 추정하지 않는다.
    - 비고는 내부 메모 필드이므로 빈 문자열로 시작한다.
    """
    row = {c: EMPTY_UNKNOWN for c in OUTPUT_COLUMNS}
    row["비고"] = ""
    return row

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

    def search_pages(
        self,
        field_name: str,
        term: str,
        *,
        page_size: int = 100,
        max_pages: int = 6,
    ) -> list[dict[str, Any]]:
        """정책명/정책키워드 검색 결과를 페이지 단위로 끝까지 수집한다."""
        collected: dict[str, dict[str, Any]] = {}
        for page in range(1, max_pages + 1):
            payload = self._request({
                "pageType": 1,
                field_name: term,
                "pageNum": page,
                "pageSize": page_size,
            })
            rows = find_policy_dicts(payload)
            if not rows:
                break
            new_count = 0
            for row in rows:
                key = clean_text(row.get("plcyNo")) or (
                    norm_name(clean_text(row.get("plcyNm"))) + "|" +
                    clean_text(row.get("aplyYmd"))
                )
                if key and key not in collected:
                    collected[key] = row
                    new_count += 1
            if len(rows) < page_size or new_count == 0:
                break
        return list(collected.values())

    def discover_finance_policies(
        self,
        *,
        max_pages: int = 6,
    ) -> list[dict[str, Any]]:
        """
        고정 정책명 목록 대신 장학·금융 관련 검색어로 후보를 넓게 탐색한다.
        상세조회 후 장학·금융 여부와 목표 지역을 다시 검증한다.
        """
        candidates: dict[str, dict[str, Any]] = {}
        matched_terms: dict[str, set[str]] = {}

        searches = [
            *(('plcyNm', term) for term in DISCOVERY_NAME_TERMS),
            *(('plcyKywdNm', term) for term in DISCOVERY_KEYWORD_TERMS),
        ]

        for field_name, term in searches:
            try:
                rows = self.search_pages(field_name, term, max_pages=max_pages)
            except Exception as e:
                print(f"[API 탐색 경고] {field_name}={term}: {e}")
                continue
            print(f"[API 탐색] {field_name}={term}: {len(rows)}건")
            for row in rows:
                key = clean_text(row.get("plcyNo")) or (
                    norm_name(clean_text(row.get("plcyNm"))) + "|" +
                    clean_text(row.get("aplyYmd"))
                )
                if not key:
                    continue
                candidates[key] = row
                matched_terms.setdefault(key, set()).add(term)

        discovered: list[dict[str, Any]] = []
        for key, cand in candidates.items():
            if not is_finance_scholarship_candidate(cand):
                continue

            detailed = cand
            plcy_no = clean_text(cand.get("plcyNo"))
            if plcy_no:
                try:
                    detail = self.detail(plcy_no)
                    if detail:
                        detailed = detail
                except Exception as e:
                    print(f"[API 상세 경고] {clean_text(cand.get('plcyNm'))}: {e}")

            if not is_finance_scholarship_candidate(detailed):
                continue

            scope, _, _, region_reason = classify_api_target_region(detailed)
            if scope not in TARGET_SCOPES:
                continue

            detailed = dict(detailed)
            detailed["__discovery_terms"] = ", ".join(sorted(matched_terms.get(key, set())))
            detailed["__region_reason"] = region_reason
            discovered.append(detailed)

        # 같은 정책의 연도별/중복 레코드가 있으면 최신 신청·등록일을 우선한다.
        return prefer_latest_api_records(discovered)

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
    # 정부·공공·교육·연구기관 도메인은 동적 정책 발견에서도 공식출처 후보로 허용.
    if host.endswith((".go.kr", ".or.kr", ".ac.kr", ".re.kr")):
        return True
    return host in OFFICIAL_DOMAINS


def fetch_document(session: requests.Session, url: str) -> dict[str, Any]:
    if not url:
        raise ValueError("빈 URL")
    if not robots_allowed(url):
        raise PermissionError(f"robots.txt에서 크롤링을 허용하지 않음: {url}")

    try:
        r = session.get(url, timeout=REQUEST_TIMEOUT, allow_redirects=True)
    except requests.exceptions.SSLError:
        # 일부 공식 사이트가 www 호스트의 인증서 설정만 잘못된 경우가 있다.
        # TLS 검증을 끄지 않고, 같은 도메인의 non-www 주소로 한 번만 재시도한다.
        parsed = urlparse(url)
        if parsed.netloc.lower().startswith("www."):
            alt = parsed._replace(netloc=parsed.netloc[4:]).geturl()
            r = session.get(alt, timeout=REQUEST_TIMEOUT, allow_redirects=True)
        else:
            raise
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
    "사업명", "정책명",
    "지원대상", "지원 대상", "대상자", "지원자격", "지원 자격", "신청자격", "신청 자격",
    "가입대상", "가입 대상", "신청대상", "신청 대상", "자격요건", "자격 요건",
    "지원내용", "지원 내용", "사업내용", "사업 내용", "지원혜택", "지원 혜택",
    "신청기간", "신청 기간", "모집기간", "모집 기간", "접수기간", "접수 기간",
    "신청일정", "신청 일정", "사업기간", "사업 기간", "운영기간", "운영 기간",
    "신청방법", "신청 방법", "접수방법", "접수 방법", "신청절차", "신청 절차",
    "제출서류", "제출 서류", "구비서류", "구비 서류",
    "지원금액", "지원 금액", "지원규모", "지원 규모", "장학금액", "장학 금액",
    "지원조건", "지원 조건", "소득기준", "소득 기준", "소득조건", "소득 조건",
    "소득요건", "소득 요건", "학자금 지원구간",
    "제외대상", "제외 대상", "지원제외", "지원 제외", "참여제한", "참여 제한",
    "문의", "문의처", "담당부서", "담당 부서", "담당자",
    "시행기관", "시행 기관", "주관기관", "주관 기관", "주최기관", "주최 기관",
    "운영기관", "운영 기관", "수행기관", "수행 기관", "담당기관", "담당 기관",
    "신청안내", "신청 안내", "사업개요", "사업 개요",
    "등록일", "게시일", "작성일", "공고일",
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
    """
    지원금액으로 안전하게 볼 수 있는 원화 금액을 추출한다.

    퍼센트는 아무 문맥에서나 지원금액으로 넣지 않는다.
    '정부기여율/지원율/매칭'처럼 지원 비율임이 명시된 문장에서만 포함한다.
    예: 국가근로의 소득구간 20% 같은 숫자가 지원금액에 섞이는 것을 방지한다.
    """
    text = clean_text(text)
    if not text:
        return ""

    money_pattern = r"(?:\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(?:억\s*)?(?:천|백|십)?\s*(?:만|천)?\s*원"
    values: list[str] = []

    for v in re.findall(money_pattern, text):
        v = clean_text(v)
        if v and v not in values:
            values.append(v)

    # 비율은 '지원 비율'임을 원문 문맥이 뒷받침하는 경우에만 허용한다.
    chunks = re.split(r"[\n。]|(?<=[.!?])\s+", text)
    rate_context_keywords = [
        "정부기여", "기여율", "지원율", "지원 비율", "지원비율",
        "매칭", "매칭지원", "매칭 지원",
    ]
    for chunk in chunks:
        c = clean_text(chunk)
        if not c or "%" not in c:
            continue
        if not any(k in c for k in rate_context_keywords):
            continue
        for pct in re.findall(r"\d+(?:\.\d+)?\s*%", c):
            pct = clean_text(pct)
            if pct not in values:
                values.append(pct)

    return ", ".join(values[:12])



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
    """거주기간이 원문에 명시된 경우만 정규화한다. 없으면 추정하지 않는다."""
    t = clean_text(text)
    if not t:
        return ""

    # 명시적으로 거주기간 제한이 없다고 적힌 경우에만 제한없음 처리.
    if re.search(r"거주\s*기간.{0,12}(?:제한\s*없|무관|관계\s*없)", t):
        return NO_LIMIT

    m = re.search(r"(\d+)\s*년\s*(?:이상|계속|연속)", t)
    if m:
        return str(int(m.group(1)) * 12)
    m = re.search(r"(\d+)\s*개월\s*(?:이상|계속|연속)", t)
    if m:
        return m.group(1)
    return ""


def infer_scope(zip_cd: str, eligibility_text: str, expected_scope: str | None) -> tuple[str, str, str]:
    """
    정책의 신청범위를 보수적으로 정규화한다.

    expected_scope는 조사대상 seed를 만들 때 공식 범위를 기준으로 지정한 값이고,
    API 후보가 candidate_region_check를 통과한 뒤에만 여기까지 들어온다.
    따라서 해당 범위는 통일 포맷으로 사용한다.

    expected_scope가 없는 일반 수집에서는 여러 지역코드가 섞였는지 먼저 보고
    한 개의 부산진구 코드가 포함되었다는 이유만으로 구 단위 사업으로 축소하지 않는다.
    """
    codes = list(dict.fromkeys(re.findall(r"\b\d{5}\b", zip_cd or "")))
    t = clean_text(eligibility_text)

    if expected_scope == "전국":
        return "전국", "전국", ""
    if expected_scope == "부산":
        return "부산", "부산광역시", ""
    if expected_scope == "부산진구":
        return "부산진구", "부산광역시", "부산진구"
    if expected_scope == "사하구":
        return "사하구", "부산광역시", "사하구"

    # 명시적인 원문 지역부터 본다.
    if "부산진구" in t:
        return "부산진구", "부산광역시", "부산진구"
    if "사하구" in t:
        return "사하구", "부산광역시", "사하구"
    if "부산광역시" in t or "부산시" in t or "부산 소재" in t or "부산지역" in t:
        return "부산", "부산광역시", ""

    if codes:
        prefixes = {c[:2] for c in codes}
        if len(prefixes) >= 3 or len(codes) >= 10:
            return "전국", "전국", ""
        if all(c.startswith("26") for c in codes):
            if set(codes) == {"26230"}:
                return REGION_CODE_MAP["26230"]
            if set(codes) == {"26380"}:
                return REGION_CODE_MAP["26380"]
            return "부산", "부산광역시", ""

    return EMPTY_UNKNOWN, EMPTY_UNKNOWN, EMPTY_UNKNOWN



def _as_age_number(value: Any) -> int | None:
    t = clean_text(value)
    if not t or t in {EMPTY_UNKNOWN, NO_LIMIT}:
        return None
    m = re.fullmatch(r"\d{1,2}", t)
    if not m:
        return None
    n = int(t)
    return n if 0 < n < 100 else None


def classify_youth_target(row: dict[str, str]) -> str:
    """
    청년대상구분 기준
    - 청년전용: 공식 연령조건 전체가 만 18~39세 범위 안에 있음 (예: 18~39, 19~34)
    - 청년포함: 공식 연령조건이 더 넓지만 18~39세를 포함하거나 명시적으로 연령제한 없음
    - 연령조건미표기: 공식자료에서 연령조건을 확인하지 못함
    """
    raw = clean_text(row.get("연령조건_원문"))
    min_age = _as_age_number(row.get("최소연령"))
    max_age = _as_age_number(row.get("최대연령"))

    if (
        row.get("최소연령") == NO_LIMIT
        or row.get("최대연령") == NO_LIMIT
        or "연령제한 없음" in raw
        or "연령 제한 없음" in raw
    ):
        return "청년포함"

    if not raw and min_age is None and max_age is None:
        return "연령조건미표기"
    if any(k in raw for k in ["미표기", "확인필요", "별도 연령조건"]):
        if min_age is None and max_age is None:
            return "연령조건미표기"

    # 최소·최대가 모두 확인된 경우가 가장 신뢰도가 높다.
    if min_age is not None and max_age is not None:
        if 18 <= min_age <= 39 and 18 <= max_age <= 39:
            return "청년전용"
        if min_age <= 39 and max_age >= 18:
            return "청년포함"

    # 단일 최대/최소 조건은 청년만을 대상으로 한다고 단정하지 않는다.
    if max_age is not None and max_age >= 18 and (min_age is None or min_age <= 39):
        return "청년포함"
    if min_age is not None and min_age <= 39 and max_age is None:
        return "청년포함"

    # 복합조건(예: 학부 만35세 / 대학원 만40세)은 원문 숫자로 보완 판정한다.
    nums = [int(x) for x in re.findall(r"(?<!\d)(\d{1,2})\s*세", raw)]
    nums = [n for n in nums if 0 < n < 100]
    if len(nums) >= 2:
        lo, hi = min(nums), max(nums)
        if 18 <= lo <= 39 and 18 <= hi <= 39:
            return "청년전용"
        if lo <= 39 and hi >= 18:
            return "청년포함"
    elif len(nums) == 1 and 18 <= nums[0]:
        return "청년포함"

    return "연령조건미표기"


def summarize_zip_codes(zip_raw: str, *, max_codes: int = 8) -> str:
    """긴 zipCd 목록을 로그/CSV에 그대로 덤프하지 않고 요약한다."""
    codes = list(dict.fromkeys(re.findall(r"\b\d{5}\b", clean_text(zip_raw))))
    if not codes:
        return ""
    if len(codes) <= max_codes:
        return ",".join(codes)
    prefixes = sorted({c[:2] for c in codes if c != "00000"})
    preview = ",".join(codes[:max_codes])
    return f"{len(codes)}개 코드(prefix={','.join(prefixes)}; 예={preview},...)"


def api_region_blob(cand: dict[str, Any]) -> str:
    fields = [
        "plcyNm", "plcyExplnCn", "plcySprtCn", "addAplyQlfcCndCn",
        "sprvsnInstCdNm", "operInstCdNm", "rgtrInstCdNm", "rgtrUpInstCdNm",
        "rgtrHghrkInstCdNm", "refUrlAddr1", "refUrlAddr2", "aplyUrlAddr",
    ]
    return " | ".join(clean_text(cand.get(k)) for k in fields if clean_text(cand.get(k)))


def classify_api_target_region(cand: dict[str, Any]) -> tuple[str, str, str, str]:
    """
    수집 대상 지역을 보수적으로 판정한다.

    대상:
    - 전국: 부산에서도 신청 가능한 전국 단위 정책
    - 부산: 부산광역시 전체 단위 정책
    - 부산진구: 부산진구 단위 정책
    - 사하구: 사하구 단위 정책

    중요:
    - 시군구 코드가 '많다'는 이유만으로 전국으로 보지 않는다.
      예: 서울 25개 자치구, 충남 여러 시군, 부산 16개 구·군은 모두 한 시·도다.
    - zipCd의 시·도 prefix가 여러 개(3개 이상)일 때만 전국성의 강한 근거로 본다.
    - 한 개 타 시·도 안의 여러 시군 정책은 조사대상에서 제외한다.
    """
    zip_raw = clean_text(cand.get("zipCd"))
    codes = list(dict.fromkeys(re.findall(r"\b\d{5}\b", zip_raw)))

    title = clean_text(cand.get("plcyNm"))
    eligibility = as_joined([
        cand.get("addAplyQlfcCndCn"), cand.get("plcyExplnCn")
    ], sep=" | ")
    institution_blob = as_joined([
        cand.get("sprvsnInstCdNm"), cand.get("operInstCdNm"),
        cand.get("rgtrInstCdNm"), cand.get("rgtrUpInstCdNm"),
        cand.get("rgtrHghrkInstCdNm"),
    ], sep=" | ")
    urls = [
        clean_text(cand.get("refUrlAddr1")),
        clean_text(cand.get("refUrlAddr2")),
        clean_text(cand.get("aplyUrlAddr")),
    ]
    hosts = {urlparse(u).netloc.lower() for u in urls if u.startswith("http")}

    # 지역 공식 도메인 자체도 강한 지역 근거로 사용한다.
    if any(h.endswith("busanjin.go.kr") or h.endswith("busanjinsf.kr") for h in hosts):
        return "부산진구", "부산광역시", "부산진구", "부산진구 공식도메인"
    if any(h.endswith("saha.go.kr") for h in hosts):
        return "사하구", "부산광역시", "사하구", "사하구 공식도메인"
    if any(h.endswith("busan.go.kr") for h in hosts):
        return "부산", "부산광역시", "", "부산 공식도메인"

    # ------------------------------------------------------------------
    # 1) zipCd가 있으면 가장 우선해서 판정
    # ------------------------------------------------------------------
    if codes:
        code_set = set(codes)
        prefixes = {c[:2] for c in codes if c != "00000"}

        # API가 전국 코드를 명시한 경우
        if "00000" in code_set:
            return "전국", "전국", "", f"전국코드 포함 zipCd={summarize_zip_codes(zip_raw)}"

        # 부산권 코드만 있는 경우
        if prefixes == {"26"}:
            if code_set == {"26230"}:
                return "부산진구", "부산광역시", "부산진구", "zipCd=26230"
            if code_set == {"26380"}:
                return "사하구", "부산광역시", "사하구", "zipCd=26380"

            # 26000(부산광역시 전체) 또는 부산 대부분의 구·군이 함께 지정된 경우만
            # 부산 전체 정책으로 본다. 소수 특정 구만 묶은 정책은 범위를 임의 확대하지 않는다.
            if "26000" in code_set or len(code_set) >= 10:
                return "부산", "부산광역시", "", f"부산 전체/광역 범위 zipCd={summarize_zip_codes(zip_raw)}"

            return "", "", "", f"부산 일부 구·군만 지정됨 zipCd={summarize_zip_codes(zip_raw)}"

        # 여러 시·도에 걸친 대규모 지역 목록은 전국 정책으로 본다.
        # 기존 v8의 '코드 10개 이상=전국' 규칙은 제거했다.
        if len(prefixes) >= 3:
            return "전국", "전국", "", f"다수 시도 zipCd={summarize_zip_codes(zip_raw)}"

        # 한 개 타 시·도만 지정된 정책은 부산 이용자가 대상이 아니므로 제외.
        if len(prefixes) == 1 and "26" not in prefixes:
            only_prefix = next(iter(prefixes))
            return "", "", "", f"타 시도 단독 범위(prefix={only_prefix}) zipCd={summarize_zip_codes(zip_raw)}"

        # 부산 + 다른 한 시도처럼 일부 지역만 묶인 경우도 전국/부산으로 확대하지 않는다.
        return "", "", "", f"일부 시도 복합범위 zipCd={summarize_zip_codes(zip_raw)}"

    # ------------------------------------------------------------------
    # 2) zipCd가 없으면 강한 텍스트/기관/URL 근거로 판정
    # ------------------------------------------------------------------
    strong_blob = as_joined([title, institution_blob, *urls], sep=" | ")
    strong_low = strong_blob.lower()
    eligibility_low = eligibility.lower()

    # 부산 구 단위는 가장 구체적인 범위부터
    if "부산진구" in strong_blob or "부산진구" in eligibility:
        return "부산진구", "부산광역시", "부산진구", "원문/기관 부산진구 명시"
    if "사하구" in strong_blob or "사하구" in eligibility:
        return "사하구", "부산광역시", "사하구", "원문/기관 사하구 명시"

    # 부산 전체 근거
    if any(k in strong_blob or k in eligibility for k in ["부산광역시", "부산시", "부산 소재", "부산지역"]):
        return "부산", "부산광역시", "", "원문/기관 부산 명시"

    # 제목·기관·공식 URL이 다른 특정 시도를 강하게 가리키면 전국 판정보다 먼저 제외한다.
    for region, kws in OTHER_REGION_KEYWORDS.items():
        if any(k.lower() in strong_low for k in kws):
            return "", "", "", f"타지역 강한 근거={region}"

    # 전국/대한민국 명시. 일반 지원내용에 우연히 등장하는 경우를 줄이기 위해
    # 제목/자격·설명 중심으로만 본다.
    national_blob = as_joined([title, eligibility], sep=" | ")
    if any(k in national_blob for k in ["전국", "대한민국", "전 국민", "전국민"]):
        return "전국", "전국", "", "원문 전국/대한민국 명시"

    # 중앙기관·중앙 공식사이트는 전국 단위 정책의 보조 근거
    central_inst = [
        "한국장학재단", "보건복지부", "금융위원회", "고용노동부",
        "서민금융진흥원", "한국고용정보원", "국토교통부",
    ]
    if hosts & CENTRAL_NATIONAL_DOMAINS or any(k in institution_blob for k in central_inst):
        return "전국", "전국", "", "중앙기관/전국 공식출처"

    # 마지막으로 자격문구에 다른 지역만 명시된 경우 제외
    for region, kws in OTHER_REGION_KEYWORDS.items():
        if any(k.lower() in eligibility_low for k in kws):
            return "", "", "", f"자격조건 타지역 명시={region}"

    return "", "", "", "지역 근거 부족"


def is_finance_scholarship_candidate(cand: dict[str, Any]) -> bool:
    title = clean_text(cand.get("plcyNm"))
    category = as_joined([
        cand.get("lclsfNm"), cand.get("mclsfNm"), cand.get("plcyKywdNm")
    ], sep=" ")
    body = as_joined([
        cand.get("plcyExplnCn"), cand.get("plcySprtCn"), cand.get("addAplyQlfcCndCn")
    ], sep=" ")

    # '금융교육/강좌/토크콘서트'처럼 금전·장학 혜택이 아닌 정보·교육성 정책은
    # 제목에 '금융'이 있다는 이유만으로 포함하지 않는다.
    education_only_tokens = ["금융교육", "금융 교육", "금융강좌", "금융 강좌", "금융스쿨", "토크콘서트", "재무설계 온라인", "교육봉사단"]
    monetary_evidence = [
        "장학", "학자금", "등록금", "대출", "융자", "이자지원", "이자 지원",
        "저축", "적금", "통장", "자산형성", "정부기여", "신용회복", "채무",
        "보증", "보증료", "장려금", "지원금", "생활비", "학업보조",
    ]
    if any(k in title for k in education_only_tokens) and not any(k in body for k in monetary_evidence):
        return False

    strong_title_keywords = [
        "장학", "학자금", "등록금", "학비", "대출", "융자", "이자",
        "저축", "적금", "통장", "자산형성", "신용회복", "채무",
        "보증", "장려금", "생활비", "학업보조",
    ]
    title_hits = sum(1 for k in strong_title_keywords if k in title)
    category_hits = sum(1 for k in FINANCE_TITLE_KEYWORDS if k in category)
    text_hits = sum(1 for k in FINANCE_TEXT_KEYWORDS if k in body)

    # 제목에 직접 금전·장학 혜택 표현이 있으면 강한 근거.
    if title_hits:
        return True

    # 제목이 '금융'만 포함하는 경우에는 본문에 실제 금융지원 근거가 있어야 한다.
    if "금융" in title and any(k in body for k in monetary_evidence):
        return True

    # 분류/키워드가 금융 성격이고 본문에도 관련 지원 내용이 있으면 포함.
    if category_hits and text_hits:
        return True

    # 본문에 서로 다른 금융·장학 표현이 여러 개 확인되는 경우 포함.
    return text_hits >= 2


def infer_finance_subclass(cand: dict[str, Any] | dict[str, str]) -> str:
    """정책명에 드러난 성격을 최우선으로 세부분류하고, 본문은 보조근거로만 쓴다."""
    title = clean_text(cand.get("plcyNm") or cand.get("정책명"))
    body = as_joined([
        cand.get("지원내용"), cand.get("plcySprtCn"), cand.get("plcyExplnCn"),
        cand.get("추가태그"), cand.get("plcyKywdNm"),
    ], sep=" ")

    # 제목 우선: 페이지 메뉴/본문의 다른 사업명 때문에 오분류되는 것을 방지
    if "장학" in title or "학업보조" in title:
        return "장학금"
    if "학자금" in title:
        if any(k in title for k in ["이자", "신용", "상환", "지원"]):
            return "학자금지원"
        if "대출" in title:
            return "학자금대출"
        return "학자금지원"
    if any(k in title for k in ["저축", "적금", "통장", "자산형성", "청약"]):
        return "자산형성"
    if "장려금" in title:
        return "장려금"
    if any(k in title for k in ["신용회복", "채무", "보증", "융자", "금융", "대출", "이자"]):
        return "금융지원"

    text = as_joined([title, body], sep=" ")
    if "장학" in text or "학업보조" in text:
        return "장학금"
    if "학자금" in text and "대출" in text:
        return "학자금대출"
    if "학자금" in text or "등록금" in text or "학비" in text:
        return "학자금지원"
    if any(k in text for k in ["저축", "적금", "통장", "자산형성", "정부기여"]):
        return "자산형성"
    if "장려금" in text:
        return "장려금"
    if any(k in text for k in ["신용회복", "채무", "보증", "융자", "금융", "이자", "대출"]):
        return "금융지원"
    return "기타금융"


def prefer_latest_api_records(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """동일 정책이 여러 연도/회차로 중복될 때 최신 레코드를 우선한다."""
    groups: dict[tuple[str, str], dict[str, Any]] = {}

    def score(r: dict[str, Any]) -> tuple[str, str, str]:
        app = clean_text(r.get("aplyYmd"))
        posted = normalize_date_string(clean_text(r.get("frstRegDt")))
        no = clean_text(r.get("plcyNo"))
        dates = re.findall(r"20\d{2}[-./]?\d{0,2}[-./]?\d{0,2}", app)
        latest = max(dates) if dates else ""
        return latest, posted, no

    for r in rows:
        key = (
            norm_name(clean_text(r.get("plcyNm"))),
            norm_name(first_nonempty(r.get("operInstCdNm"), r.get("sprvsnInstCdNm"), default="")),
        )
        old = groups.get(key)
        if old is None or score(r) > score(old):
            groups[key] = r
    return list(groups.values())


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
    if not t:
        return ""

    # 명시적으로 취업/재직 상태를 보지 않는다고 적힌 경우에만 제한없음.
    if re.search(r"(?:취업|재직|근로)\s*(?:여부|상태)?.{0,10}(?:무관|제한\s*없|관계\s*없)", t):
        return NO_LIMIT

    tags = []
    for k, label in [
        ("미취업", "미취업자"), ("재직", "재직자"), ("근로", "근로자"),
        ("자영업", "자영업자"), ("소상공인", "소상공인"), ("프리랜서", "프리랜서"),
        ("일용", "일용근로자"),
    ]:
        if k in t and label not in tags:
            tags.append(label)
    return ", ".join(tags)



def infer_school(text: str) -> str:
    t = clean_text(text)
    if not t:
        return ""

    if re.search(r"(?:학력|학적|재학)\s*(?:조건|여부)?.{0,10}(?:무관|제한\s*없|관계\s*없)", t):
        return NO_LIMIT

    chunks = []
    for key in ["재학생", "휴학생", "졸업생", "대학생", "대학원생", "고등학생", "학력", "대학교", "대학원"]:
        if key in t:
            sentence = extract_sentence_by_keywords(t, [key], max_sentences=1)
            if sentence and sentence not in chunks:
                chunks.append(sentence)
    return as_joined(chunks[:4], sep=" / ")



def infer_special_target(text: str) -> str:
    """특화대상이 원문에 실제 등장한 경우만 반환한다. 없으면 빈 값(후에 확인필요)."""
    t = clean_text(text)
    if not t:
        return ""
    keys = ["다자녀", "지역인재", "기초생활수급자", "차상위", "한부모", "장애인", "자립준비청년", "저소득", "소상공인", "군인"]
    return ", ".join([k for k in keys if k in t])



def infer_activity_region(text: str) -> str:
    """
    거주지 외 학교/직장/활동지역을 자격으로 인정한다고 명시된 경우에만 '예'.
    명시가 없으면 '아니오'나 '해당없음'을 추정하지 않고 확인필요로 남긴다.
    """
    t = clean_text(text)
    if not t:
        return ""
    if re.search(r"(소재\s*(대학|대학교|대학원|기업|직장)|재직.*부산|활동.*부산)", t):
        return "예"
    return ""



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


def extract_date_context(text: str, keywords: list[str], max_chunks: int = 5) -> str:
    """키워드와 날짜가 같은 문맥에 있는 문장을 보수적으로 찾는다."""
    chunks = re.split(r"[\n。]|(?<=[.!?])\s+", clean_text(text))
    selected: list[str] = []
    for chunk in chunks:
        c = clean_text(chunk)
        if not c:
            continue
        if any(k in c for k in keywords) and re.search(r"20\d{2}|\d{1,2}\s*[./월]\s*\d{1,2}", c):
            selected.append(c)
            if len(selected) >= max_chunks:
                break
    return as_joined(selected, sep=" / ")


def extract_posted_date(text: str) -> str:
    """등록일/게시일/작성일/공고일 주변에서 날짜가 실제 확인될 때만 반환한다."""
    lines = text_lines(text)
    for i, line in enumerate(lines):
        if any(label in line for label in ["등록일", "게시일", "작성일", "공고일"]):
            candidate = line
            if i + 1 < len(lines):
                candidate += " " + lines[i + 1]
            d = normalize_date_string(candidate)
            if d:
                return d
    return ""


KOSAF_NAV_NOISE = [
    "신용카드사회공헌재단", "WEST 재정지원금", "재단소개", "고객센터",
    "로그인", "통합검색", "학자금뱅킹", "채무자신고", "전자민원",
]


def filter_noise_chunks(value: str, deny_keywords: list[str]) -> str:
    """사이트 메뉴/다른 사업명처럼 명백한 잡음 문장을 제거한다."""
    if not value:
        return ""
    chunks = [clean_text(x) for x in re.split(r"\s*/\s*|\n+", value) if clean_text(x)]
    kept = [c for c in chunks if not any(k in c for k in deny_keywords)]
    return as_joined(kept, sep=" / ")


def parse_crawl_generic(doc: dict[str, Any]) -> dict[str, str]:
    text = doc.get("text", "")
    anchors = doc.get("anchors", [])

    target = extract_labeled_section(
        text,
        ["지원대상", "지원 대상", "대상자", "가입대상", "가입 대상",
         "신청자격", "신청 자격", "지원자격", "지원 자격",
         "신청대상", "신청 대상", "자격요건", "자격 요건"],
        max_follow=14,
    )
    support = extract_labeled_section(
        text,
        ["지원내용", "지원 내용", "사업내용", "사업 내용", "지원혜택", "지원 혜택"],
        max_follow=14,
    )
    app_period = extract_labeled_section(
        text,
        ["신청기간", "신청 기간", "모집기간", "모집 기간",
         "접수기간", "접수 기간", "신청일정", "신청 일정"],
        max_follow=7,
    )
    biz_period = extract_labeled_section(
        text,
        ["사업기간", "사업 기간", "운영기간", "운영 기간", "추진일정", "추진 일정"],
        max_follow=7,
    )
    method = extract_labeled_section(
        text,
        ["신청방법", "신청 방법", "접수방법", "접수 방법", "신청절차", "신청 절차"],
        max_follow=8,
    )
    income = extract_labeled_section(
        text,
        ["소득조건", "소득 조건", "소득기준", "소득 기준",
         "소득요건", "소득 요건", "학자금 지원구간"],
        max_follow=10,
    )
    exclude = extract_labeled_section(
        text,
        ["제외대상", "제외 대상", "지원제외", "지원 제외", "참여제한", "참여 제한"],
        max_follow=10,
    )
    amount_section = extract_labeled_section(
        text,
        ["지원금액", "지원 금액", "지원규모", "지원 규모",
         "장학금", "장학금액", "장학 금액", "근로장려금"],
        max_follow=10,
    )
    implementing_agency = extract_labeled_section(
        text,
        ["시행기관", "시행 기관", "주관기관", "주관 기관", "주최기관", "주최 기관"],
        max_follow=3,
    )
    operating_agency = extract_labeled_section(
        text,
        ["운영기관", "운영 기관", "수행기관", "수행 기관", "담당기관", "담당 기관"],
        max_follow=3,
    )
    department = extract_labeled_section(text, ["담당부서", "담당 부서"], max_follow=3)
    contact_section = extract_labeled_section(text, ["문의처", "문의", "담당자"], max_follow=4)
    docs = extract_labeled_section(text, ["제출서류", "제출 서류", "구비서류", "구비 서류"], max_follow=12)

    if not target:
        target = extract_sentence_by_keywords(
            text,
            ["지원대상", "지원자격", "신청자격", "가입대상", "재학생", "대학생", "청년"],
            max_sentences=6,
        )
    if not support:
        support = extract_sentence_by_keywords(
            text,
            ["지원내용", "지원금액", "장학금", "지원금", "정부기여금", "이자 지원"],
            max_sentences=6,
        )
    if not app_period:
        app_period = extract_date_context(text, ["신청", "접수", "모집"], max_chunks=5)
    if not income:
        income = extract_sentence_by_keywords(
            target or text,
            ["소득", "중위소득", "건강보험료", "학자금 지원구간", "연매출", "총급여"],
            max_sentences=5,
        )

    app_start, app_end = parse_date_range(app_period)
    biz_start, biz_end = parse_date_range(biz_period)
    age_min, age_max, age_raw = extract_age(target or text)

    residency = extract_sentence_by_keywords(
        target or text,
        ["거주", "주민등록", "주소", "소재 대학", "소재 대학교", "소재 대학원"],
        max_sentences=5,
    )
    school = infer_school(target)
    employment = infer_employment(target)

    always = (
        "예" if any(k in app_period for k in ["상시", "연중", "수시"])
        else ("아니오" if app_start or app_end else "")
    )
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
        "시행기관": implementing_agency,
        "운영기관": operating_agency,
        "기관 담당부서": department,
        "원문URL": doc.get("url", ""),
        "게시일": extract_posted_date(text),
    }


def parse_kosaf_document(doc: dict[str, Any], seed: PolicySeed) -> dict[str, str]:
    """
    한국장학재단 페이지는 메뉴 텍스트가 본문과 섞이는 경우가 많으므로
    명백한 메뉴/타 사업 문구를 제거하고, 불확실하면 값을 비워 둔다.
    """
    base = parse_crawl_generic(doc)
    text = doc.get("text", "")

    for field in ["지원대상_원문", "지원내용", "학력·재학조건", "소득조건", "신청방법"]:
        base[field] = filter_noise_chunks(base.get(field, ""), KOSAF_NAV_NOISE)

    # 지원내용이 정책과 무관한 메뉴 문구뿐이면 잘못 채우지 않는다.
    support = base.get("지원내용", "")
    if support and not any(k in support for k in ["장학", "등록금", "생활비", "대출", "근로", "이자", "지원"]):
        base["지원내용"] = ""
        base["지원금액"] = ""

    if not base.get("지원대상_원문"):
        candidate = extract_sentence_by_keywords(
            text,
            ["지원대상", "지원자격", "국내 대학", "재학생", "학부생", "대학원생"],
            max_sentences=6,
        )
        base["지원대상_원문"] = filter_noise_chunks(candidate, KOSAF_NAV_NOISE)

    if not base.get("소득조건"):
        candidate = extract_sentence_by_keywords(
            text,
            ["학자금 지원구간", "소득구간", "기초생활수급자", "차상위"],
            max_sentences=5,
        )
        base["소득조건"] = filter_noise_chunks(candidate, KOSAF_NAV_NOISE)

    if not base.get("지원내용"):
        candidate = extract_sentence_by_keywords(
            text,
            ["지원금액", "등록금", "생활비", "장학금", "대출한도", "근로장학금"],
            max_sentences=6,
        )
        base["지원내용"] = filter_noise_chunks(candidate, KOSAF_NAV_NOISE)

    if base.get("지원내용") and not base.get("지원금액"):
        base["지원금액"] = extract_money(base["지원내용"])

    if not base.get("신청시작일") or not base.get("신청마감일"):
        ctx = extract_date_context(text, ["신청", "접수"], max_chunks=6)
        start, end = parse_date_range(ctx)
        if start and not base.get("신청시작일"):
            base["신청시작일"] = start
        if end and not base.get("신청마감일"):
            base["신청마감일"] = end

    return base


def parse_crawl(doc: dict[str, Any], seed: PolicySeed) -> dict[str, str]:
    host = urlparse(doc.get("url", "")).netloc.lower()
    if "kosaf.go.kr" in host:
        return parse_kosaf_document(doc, seed)
    return parse_crawl_generic(doc)


def discover_relevant_links(doc: dict[str, Any], seed: PolicySeed, max_links: int = 2) -> list[str]:
    """
    홈페이지/목록 페이지만 받은 경우, 같은 공식 사이트 안의 장학금·모집·선발 공고 링크를 보수적으로 찾는다.
    링크 라벨에 정책명/지역명/장학 관련 단어가 실제로 있을 때만 후보로 쓴다.
    """
    source_host = urlparse(doc.get("url", "")).netloc.lower().removeprefix("www.")
    aliases = [seed.name, *seed.aliases, *seed.api_queries]
    scored: list[tuple[int, str]] = []

    for label, href in doc.get("anchors", []):
        if not href.startswith("http") or not is_official_url(href):
            continue
        host = urlparse(href).netloc.lower().removeprefix("www.")
        if host != source_host:
            continue
        label_clean = clean_text(label)
        if not label_clean:
            continue

        score = 0
        nlabel = norm_name(label_clean)
        if any(norm_name(a) and norm_name(a) in nlabel for a in aliases):
            score += 6
        for token in ["장학생", "장학금", "모집", "선발", "공고", "대학생"]:
            if token in label_clean:
                score += 1
        if seed.expected_scope == "부산진구" and "부산진구" in label_clean:
            score += 2
        if seed.expected_scope == "사하구" and "사하구" in label_clean:
            score += 2

        if score >= 2:
            scored.append((score, href))

    scored.sort(key=lambda x: x[0], reverse=True)
    out: list[str] = []
    for _, href in scored:
        if href not in out:
            out.append(href)
        if len(out) >= max_links:
            break
    return out

# -----------------------------------------------------------------------------
# API -> CSV 매핑
# -----------------------------------------------------------------------------
def api_to_partial(api: dict[str, Any], seed: PolicySeed) -> dict[str, str]:
    eligibility = as_joined([
        api.get("addAplyQlfcCndCn"),
        api.get("plcyExplnCn"),
        api.get("plcySprtCn"),
    ], sep=" / ")

    # 연령은 '제한 없음' 플래그가 명시된 경우에만 제한없음으로 정규화한다.
    age_limit_flag = clean_text(api.get("sprtTrgtAgeLmtYn")).upper()
    raw_min_age = clean_text(api.get("sprtTrgtMinAge"))
    raw_max_age = clean_text(api.get("sprtTrgtMaxAge"))
    min_age = "" if raw_min_age in {"", "0", "00"} else raw_min_age
    max_age = "" if raw_max_age in {"", "0", "00"} else raw_max_age

    if age_limit_flag in {"N", "NO", "0", "없음", "제한없음"}:
        min_age = NO_LIMIT
        max_age = NO_LIMIT
        age_raw = "연령제한 없음"
    elif min_age or max_age:
        age_raw = f"지원대상 최소연령={min_age or '미표기'}, 최대연령={max_age or '미표기'}"
    else:
        age_raw = ""

    # 소득 0은 '0원 조건'이라고 추정하지 않는다. 코드북이 없으므로 원시코드는 보존한다.
    earn_code = clean_text(api.get("earnCndSeCd"))
    earn_min = clean_text(api.get("earnMinAmt"))
    earn_max = clean_text(api.get("earnMaxAmt"))
    earn_etc = clean_text(api.get("earnEtcCn"))
    income_parts: list[str] = []
    if earn_code:
        income_parts.append(f"소득조건구분코드={earn_code}")
    if earn_min not in {"", "0", "00"}:
        income_parts.append(f"소득최소금액={earn_min}")
    if earn_max not in {"", "0", "00"}:
        income_parts.append(f"소득최대금액={earn_max}")
    if earn_etc:
        income_parts.append(earn_etc)
    income = as_joined(income_parts)

    app_raw = clean_text(api.get("aplyYmd"))
    app_start, app_end = parse_date_range(app_raw)
    biz_start = normalize_date_string(clean_text(api.get("bizPrdBgngYmd")))
    biz_end = normalize_date_string(clean_text(api.get("bizPrdEndYmd")))
    always = (
        "예" if any(k in app_raw for k in ["상시", "연중", "수시"])
        else ("아니오" if app_start or app_end else "")
    )

    scope, sido, sigungu = infer_scope(clean_text(api.get("zipCd")), eligibility, seed.expected_scope)
    job_text = infer_employment(eligibility)
    school_text = infer_school(eligibility)
    special = infer_special_target(eligibility)
    residence = extract_sentence_by_keywords(
        eligibility,
        ["거주", "주민등록", "주소", "소재 대학", "소재 대학교", "소재 대학원"],
        max_sentences=5,
    )

    raw_codes = {
        "zipCd": summarize_zip_codes(clean_text(api.get("zipCd"))),
        "jobCd": api.get("jobCd"),
        "schoolCd": api.get("schoolCd"),
        "plcyMajorCd": api.get("plcyMajorCd"),
        "sBizCd": api.get("sBizCd"),
        "mrgSttsCd": api.get("mrgSttsCd"),
        "aplyPrdSeCd": api.get("aplyPrdSeCd"),
        "sprtTrgtAgeLmtYn": api.get("sprtTrgtAgeLmtYn"),
    }
    raw_codes = {k: clean_text(v) for k, v in raw_codes.items() if clean_text(v)}

    return {
        "정책명": clean_text(api.get("plcyNm")),
        "신청범위": scope,
        "대상유형": infer_target_type(eligibility, seed.target_hint),
        "청년대상구분": "",
        "대상시도": sido,
        "대상시군구": sigungu,
        # 시행기관은 API 값으로 채우지 않는다. 공식 원문 크롤링에서 실제로 확인될 때만 입력한다.
        "시행기관": "",
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
        "기타조건": as_joined([
            api.get("etcMttrCn"),
            f"원시코드={json.dumps(raw_codes, ensure_ascii=False)}" if raw_codes else "",
        ]),
        "신청시작일": app_start,
        "신청마감일": app_end,
        "운영시작일": biz_start,
        "운영종료일": biz_end,
        "상시모집": always,
        "신청방법": clean_text(api.get("plcyAplyMthdCn")),
        "신청URL": clean_text(api.get("aplyUrlAddr")),
        "원문URL": first_nonempty(api.get("refUrlAddr1"), api.get("refUrlAddr2"), default=""),
        "게시일": normalize_date_string(clean_text(api.get("frstRegDt"))),
        "요약": clean_text(api.get("plcyExplnCn")),
    }



def merge_fill(row: dict[str, str], data: dict[str, str], overwrite: bool = False) -> None:
    """빈 값/확인필요만 채운다. 빈 문자열은 '근거 없음'이므로 덮어쓰지 않는다."""
    for k, v in data.items():
        if k not in row:
            continue
        v = clean_text(v)
        if not v or v == EMPTY_UNKNOWN:
            continue
        if overwrite or row[k] in {"", EMPTY_UNKNOWN}:
            row[k] = v


OFFICIAL_DYNAMIC_FIELDS = {
    "신청시작일", "신청마감일", "운영시작일", "운영종료일",
    "상시모집", "신청방법", "신청URL", "문의처", "기관 담당부서",
    "원문URL", "게시일",
}


def merge_official_crawl(
    row: dict[str, str],
    parsed: dict[str, str],
    *,
    prefer_dynamic: bool,
) -> None:
    """
    공식 원문 결과를 병합한다.

    - 크롤러가 값을 못 찾았으면 기존 값을 지우지 않는다.
    - 신청기간/신청방법 등 변동성이 큰 필드만 curated 공식 원문에서 우선한다.
    - 지원대상/금액 등은 generic 파서 오탐 가능성이 있어 API 값을 무조건 덮지 않는다.
    - '해당없음'은 코드가 자동 생성하지 않는다.
    """
    for k, v in parsed.items():
        if k not in row:
            continue
        v = clean_text(v)
        if not v or v == EMPTY_UNKNOWN:
            continue
        if row[k] in {"", EMPTY_UNKNOWN}:
            row[k] = v
            continue
        if prefer_dynamic and k in OFFICIAL_DYNAMIC_FIELDS:
            row[k] = v



def finalize_row(
    row: dict[str, str],
    seed: PolicySeed,
    api_obj: dict[str, Any] | None,
    match_score: float,
    method: list[str],
) -> dict[str, str]:
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

    # 최종 연령값/원문을 기준으로 세 가지 값만 사용한다.
    row["청년대상구분"] = classify_youth_target(row)

    scope_text = as_joined([
        row.get("지원대상_원문"),
        row.get("거주조건_원문"),
        row.get("학력·재학조건"),
    ])
    s, sido, sigungu = infer_scope(
        clean_text(api_obj.get("zipCd")) if api_obj else "",
        scope_text,
        seed.expected_scope,
    )
    if s != EMPTY_UNKNOWN:
        row["신청범위"], row["대상시도"], row["대상시군구"] = s, sido, sigungu

    if seed.apply_url and row["신청URL"] in {"", EMPTY_UNKNOWN}:
        row["신청URL"] = seed.apply_url
    if seed.official_url and row["원문URL"] in {"", EMPTY_UNKNOWN}:
        row["원문URL"] = seed.official_url

    # 신청범위가 전국/부산으로 확정된 경우 '특정 시군구 제한 없음'은 범위 정의상 확정 가능하다.
    # 그 외 필드는 정보가 없다고 제한없음/해당없음으로 바꾸지 않는다.
    if row["신청범위"] in {"전국", "부산"} and row["대상시군구"] in {"", EMPTY_UNKNOWN}:
        row["대상시군구"] = NO_LIMIT

    row["진행상태"] = calc_status(
        "" if row["신청시작일"] == EMPTY_UNKNOWN else row["신청시작일"],
        "" if row["신청마감일"] == EMPTY_UNKNOWN else row["신청마감일"],
        row["상시모집"],
    )

    api_no = clean_text(api_obj.get("plcyNo")) if api_obj else ""
    row["data_id"] = stable_id(row["정책명"], row["원문URL"], api_no)

    notes: list[str] = []
    if api_obj:
        if match_score < 0:
            notes.append("온통청년 청년정책API 자동탐색 수집")
        else:
            notes.append(f"온통청년API 매칭점수={match_score:.2f}")
    else:
        notes.append("온통청년API에서 신뢰 가능한 동일 정책 미확인")
    if seed.expected_scope and row["신청범위"] == EMPTY_UNKNOWN:
        notes.append(f"조사대상 기대범위={seed.expected_scope}; 원문/API에서 재검증 필요")
    if row["원문URL"] != EMPTY_UNKNOWN and not is_official_url(row["원문URL"]):
        notes.append("원문URL이 허용된 공식 도메인 목록 밖임: 시행기관 원문 재확인 필요")
    row["비고"] = as_joined([row.get("비고"), *notes])

    # 마지막까지 근거를 찾지 못한 값만 '확인필요'. '해당없음'으로 자동 치환하지 않는다.
    for col in OUTPUT_COLUMNS:
        if row[col] == "":
            row[col] = EMPTY_UNKNOWN

    return row

# -----------------------------------------------------------------------------
# 수집 파이프라인
# -----------------------------------------------------------------------------
def collect_one(
    seed: PolicySeed,
    api: YouthPolicyAPI | None,
    session: requests.Session,
) -> tuple[dict[str, str], dict[str, Any]]:
    row = blank_row()
    method: list[str] = []
    api_obj: dict[str, Any] | None = None
    match_score = 0.0
    api_query_used = ""
    api_match_note = ""
    errors: list[str] = []

    # 1) 온통청년 API
    if api:
        try:
            api_obj, match_score, api_query_used, api_match_note = api.find_best(seed)
            if api_obj:
                merge_fill(row, api_to_partial(api_obj, seed), overwrite=False)
                method.append("API")
        except Exception as e:
            errors.append(f"API 오류: {e}")

    # 2) 공식 원문 우선. API 참고URL은 보완용.
    crawl_queue: list[tuple[str, bool]] = []
    if seed.official_url and is_official_url(seed.official_url):
        crawl_queue.append((seed.official_url, True))

    if api_obj:
        for k in ("refUrlAddr1", "refUrlAddr2"):
            u = clean_text(api_obj.get(k))
            if not u or not is_official_url(u):
                continue
            if not url_region_compatible(u, seed.expected_scope):
                errors.append(f"API 참고URL 지역불일치로 제외: {u}")
                continue
            if all(existing != u for existing, _ in crawl_queue):
                crawl_queue.append((u, False))

    crawled_docs: list[dict[str, Any]] = []
    visited: set[str] = set()
    idx = 0

    # 공식 메인/목록에서 실제 모집·선발 공고 링크가 발견되면 같은 공식 도메인에 한해 추가 확인.
    while idx < len(crawl_queue) and len(crawled_docs) < 3:
        url, is_primary = crawl_queue[idx]
        idx += 1
        if url in visited:
            continue
        visited.add(url)

        try:
            doc = fetch_document(session, url)
            parsed = parse_crawl(doc, seed)
            merge_official_crawl(row, parsed, prefer_dynamic=is_primary)
            crawled_docs.append(doc)
            if "크롤링" not in method:
                method.append("크롤링")

            # curated 공식페이지가 목록/홈페이지인 경우 관련 공고 링크를 좁게 탐색한다.
            if is_primary:
                for link in discover_relevant_links(doc, seed, max_links=2):
                    if link not in visited and all(existing != link for existing, _ in crawl_queue):
                        crawl_queue.append((link, True))
        except Exception as e:
            errors.append(f"크롤링 오류 {url}: {e}")

    if seed.apply_url and row["신청URL"] in {"", EMPTY_UNKNOWN}:
        row["신청URL"] = seed.apply_url

    # 4) API/크롤링으로 끝까지 확인하지 못한 필드만 사전 검증값으로 보완.
    curated_fields, curated_note = apply_curated_fallback(row, seed)
    if curated_fields:
        method.append("검증값보완")
        row["비고"] = as_joined([
            row.get("비고"),
            f"사전검증값 보완필드={', '.join(curated_fields)}",
            curated_note,
        ])

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
        "curated_fields": curated_fields,
        "errors": errors,
        "method": method,
    }
    return row, debug



def make_dynamic_seed(api_obj: dict[str, Any]) -> PolicySeed | None:
    scope, _, _, _ = classify_api_target_region(api_obj)
    if scope not in TARGET_SCOPES:
        return None
    name = clean_text(api_obj.get("plcyNm"))
    if not name:
        return None
    official_url = first_nonempty(
        api_obj.get("refUrlAddr1"), api_obj.get("refUrlAddr2"), default=""
    )
    if official_url and not is_official_url(official_url):
        official_url = None
    apply_url = clean_text(api_obj.get("aplyUrlAddr")) or None
    tags = [
        clean_text(x) for x in re.split(r"[,|]", clean_text(api_obj.get("plcyKywdNm")))
        if clean_text(x)
    ]
    return PolicySeed(
        name=name,
        api_queries=[],
        official_url=official_url,
        apply_url=apply_url,
        expected_scope=scope,
        subclass=infer_finance_subclass(api_obj),
        tags=tags[:12],
        target_hint=None,
        aliases=[],
    )


def collect_discovered_api_policy(
    api_obj: dict[str, Any],
    session: requests.Session,
) -> tuple[dict[str, str], dict[str, Any]]:
    seed = make_dynamic_seed(api_obj)
    if seed is None:
        raise ValueError("목표 지역의 장학·금융 정책이 아님")

    row = blank_row()
    method = ["API"]
    errors: list[str] = []
    merge_fill(row, api_to_partial(api_obj, seed), overwrite=False)

    scope, sido, sigungu, region_reason = classify_api_target_region(api_obj)
    row["신청범위"], row["대상시도"], row["대상시군구"] = scope, sido, sigungu

    crawl_queue: list[str] = []
    for value in [
        api_obj.get("refUrlAddr1"), api_obj.get("refUrlAddr2"), seed.official_url,
        api_obj.get("aplyUrlAddr"),
    ]:
        u = clean_text(value)
        if u.startswith("http") and is_official_url(u) and u not in crawl_queue:
            crawl_queue.append(u)

    crawled_docs: list[dict[str, Any]] = []
    for url in crawl_queue[:3]:
        try:
            doc = fetch_document(session, url)
            parsed = parse_crawl(doc, seed)
            merge_official_crawl(row, parsed, prefer_dynamic=True)
            crawled_docs.append(doc)
            if "크롤링" not in method:
                method.append("크롤링")
        except Exception as e:
            errors.append(f"크롤링 오류 {url}: {e}")

    curated_fields, curated_note = apply_curated_fallback(row, seed)
    if curated_fields:
        method.append("검증값보완")
        row["비고"] = as_joined([
            row.get("비고"),
            f"사전검증값 보완필드={', '.join(curated_fields)}",
            curated_note,
        ])

    row["비고"] = as_joined([
        row.get("비고"),
        f"API탐색어={clean_text(api_obj.get('__discovery_terms'))}",
        f"지역판정={region_reason}",
    ])
    row = finalize_row(row, seed, api_obj, -1.0, method)
    if errors:
        row["비고"] = as_joined([row["비고"], *errors])

    debug = {
        "seed": seed.name,
        "api_query_used": clean_text(api_obj.get("__discovery_terms")),
        "api_match_score": -1.0,
        "api_plcyNo": clean_text(api_obj.get("plcyNo")),
        "api_plcyNm": clean_text(api_obj.get("plcyNm")),
        "api_match_note": region_reason,
        "crawl_urls": [d.get("url") for d in crawled_docs],
        "curated_fields": curated_fields,
        "errors": errors,
        "method": method,
    }
    return row, debug


def discover_index_finance_links(
    session: requests.Session,
    url: str,
    *,
    max_links: int = 60,
) -> list[tuple[str, str]]:
    """부산청년플랫폼 같은 공식 목록/캘린더에서 장학·금융 행의 상세 링크를 찾는다."""
    if not robots_allowed(url):
        return []
    r = session.get(url, timeout=REQUEST_TIMEOUT, allow_redirects=True)
    r.raise_for_status()
    time.sleep(REQUEST_DELAY_SECONDS)
    if not r.encoding or r.encoding.lower() in {"iso-8859-1", "ascii"}:
        r.encoding = r.apparent_encoding or "utf-8"
    soup = BeautifulSoup(r.text, "html.parser")
    results: list[tuple[str, str]] = []
    seen: set[str] = set()
    category_labels = {"일자리", "주거", "생활안정", "문화", "참여", "권리", "복지", "교육"}

    index_base = urldefrag(r.url).url

    for a in soup.find_all("a", href=True):
        raw_href = clean_text(a.get("href"))
        if not raw_href or raw_href.startswith("javascript:") or raw_href in {"#", "#none"}:
            continue
        tr = a.find_parent("tr")
        container = tr or a.parent
        context = clean_text(container.get_text(" ", strip=True)) if container else clean_text(a.get_text(" ", strip=True))
        fake = {"plcyNm": context, "plcyExplnCn": context, "plcySprtCn": context}
        if not is_finance_scholarship_candidate(fake):
            continue
        href = urljoin(r.url, raw_href)
        href_base = urldefrag(href).url
        # 목록 자기 자신/더미 링크는 정책 상세로 취급하지 않는다.
        if href_base == index_base or "menuCd=0" in href_base:
            continue
        if not href.startswith("http") or not is_official_url(href) or href in seen:
            continue

        name = ""
        if tr:
            cells = [clean_text(c.get_text(" ", strip=True)) for c in tr.find_all(["th", "td"])]
            for cell in cells:
                if not cell or cell in category_labels or cell == "바로가기":
                    continue
                if re.search(r"(?:\d{1,2}월|상시|신청|모집|분기)", cell) and len(cell) < 25:
                    continue
                if any(k in cell for k in FINANCE_TITLE_KEYWORDS):
                    name = cell
                    break
        if not name:
            name = context
        results.append((name, href))
        seen.add(href)
        if len(results) >= max_links:
            break
    return results


def collect_local_index_policy(
    name: str,
    url: str,
    scope: str,
    session: requests.Session,
) -> tuple[dict[str, str] | None, dict[str, Any]]:
    seed = PolicySeed(
        name=clean_text(name), api_queries=[], official_url=url,
        expected_scope=scope, subclass="기타금융", tags=[], target_hint=None,
    )
    errors: list[str] = []
    try:
        doc = fetch_document(session, url)
        parsed = parse_crawl(doc, seed)
    except Exception as e:
        return None, {
            "seed": seed.name, "api_query_used": "", "api_match_score": 0.0,
            "api_plcyNo": "", "api_plcyNm": "", "api_match_note": "지역 공식 인덱스",
            "crawl_urls": [], "curated_fields": [], "errors": [str(e)], "method": [],
        }

    row = blank_row()
    row["정책명"] = seed.name
    row["신청범위"] = scope
    if scope == "부산":
        row["대상시도"], row["대상시군구"] = "부산광역시", NO_LIMIT
    elif scope == "부산진구":
        row["대상시도"], row["대상시군구"] = "부산광역시", "부산진구"
    elif scope == "사하구":
        row["대상시도"], row["대상시군구"] = "부산광역시", "사하구"
    merge_official_crawl(row, parsed, prefer_dynamic=True)

    # 상세페이지 본문 자체가 장학·금융이 아닌 경우 목록 문맥 오탐으로 보고 제외한다.
    body_check = {
        "plcyNm": row.get("정책명"),
        "plcyExplnCn": row.get("지원내용"),
        "plcySprtCn": as_joined([row.get("지원내용"), row.get("지원금액")]),
    }
    if not is_finance_scholarship_candidate(body_check):
        return None, {
            "seed": seed.name, "api_query_used": "", "api_match_score": 0.0,
            "api_plcyNo": "", "api_plcyNm": "", "api_match_note": "금융·장학 상세검증 제외",
            "crawl_urls": [doc.get("url")], "curated_fields": [], "errors": [], "method": ["크롤링"],
        }

    seed.subclass = infer_finance_subclass(row)
    curated_fields, curated_note = apply_curated_fallback(row, seed)
    method = ["크롤링"]
    if curated_fields:
        method.append("검증값보완")
        row["비고"] = as_joined([
            row.get("비고"), f"사전검증값 보완필드={', '.join(curated_fields)}", curated_note,
        ])
    row = finalize_row(row, seed, None, 0.0, method)
    return row, {
        "seed": seed.name, "api_query_used": "", "api_match_score": 0.0,
        "api_plcyNo": "", "api_plcyNm": "", "api_match_note": "지역 공식 인덱스 자동발견",
        "crawl_urls": [doc.get("url")], "curated_fields": curated_fields,
        "errors": errors, "method": method,
    }


def dedupe_rows(rows: list[dict[str, str]]) -> list[dict[str, str]]:
    """정책명+시행기관+신청기간 기준 중복 제거. 정보가 많은 행을 우선."""
    groups: dict[tuple[str, str, str, str, str], dict[str, str]] = {}

    def richness(r: dict[str, str]) -> int:
        return sum(1 for v in r.values() if v not in {"", EMPTY_UNKNOWN, NO_LIMIT})

    for r in rows:
        agency = first_nonempty(r.get("운영기관"), r.get("시행기관"), default="")
        key = (
            norm_name(r["정책명"]),
            norm_name(agency),
            r["신청범위"],
            r["신청시작일"] if r["신청시작일"] != EMPTY_UNKNOWN else "",
            r["신청마감일"] if r["신청마감일"] != EMPTY_UNKNOWN else "",
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
    rows: list[dict[str, str]] = []
    for term in DISCOVERY_NAME_TERMS:
        rows.append({
            "검색유형": "온통청년 청년정책API-정책명",
            "검색어/정책명": term,
            "지역범위": "전국(부산 포함) / 부산 / 부산진구 / 사하구",
            "공식URL": API_URL,
            "비고": "자동 후보 탐색 후 장학·금융/지역 재검증",
        })
    for term in DISCOVERY_KEYWORD_TERMS:
        rows.append({
            "검색유형": "온통청년 청년정책API-키워드",
            "검색어/정책명": term,
            "지역범위": "전국(부산 포함) / 부산 / 부산진구 / 사하구",
            "공식URL": API_URL,
            "비고": "정책명 검색 누락 보완",
        })
    for scope, url in LOCAL_INDEX_SOURCES:
        rows.append({
            "검색유형": "공식사이트 인덱스 크롤링",
            "검색어/정책명": "장학·금융 자동발견",
            "지역범위": scope,
            "공식URL": url,
            "비고": "표/목록에서 관련 상세페이지 링크 자동 탐색",
        })
    for seed in SUPPLEMENTAL_POLICY_SEEDS:
        rows.append({
            "검색유형": "누락방지 보완",
            "검색어/정책명": seed.name,
            "지역범위": seed.expected_scope or EMPTY_UNKNOWN,
            "공식URL": seed.official_url or EMPTY_UNKNOWN,
            "비고": "API/인덱스에서 누락된 경우에만 공식원문 크롤링",
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
    parser = argparse.ArgumentParser(
        description="부산 청년 AI 생활·혜택 안내 서비스 - 장학·금융 자동 탐색 수집기 v9"
    )
    parser.add_argument("--out-dir", default="output", help="CSV 출력 폴더 (기본: output)")
    parser.add_argument("--no-api", action="store_true", help="온통청년 API 없이 공식사이트 크롤링만 수행")
    parser.add_argument("--no-local-index", action="store_true", help="부산청년플랫폼 등 공식 인덱스 자동탐색 생략")
    parser.add_argument("--max-pages", type=int, default=6, help="API 검색어별 최대 페이지 수 (기본: 6)")
    parser.add_argument(
        "--region", default="",
        choices=["전국", "부산", "부산진구", "사하구"],
        help="특정 지역만 출력하고 싶을 때 사용",
    )
    args = parser.parse_args()

    out_dir = Path(args.out_dir)
    session = requests.Session()
    session.headers.update({
        "User-Agent": USER_AGENT,
        "Accept": "application/json,text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.6",
    })

    api_keys = load_youthcenter_api_keys()
    print_api_key_status(api_keys)
    policy_api_key = api_keys.get("policy", "")
    api: YouthPolicyAPI | None = None
    if not args.no_api and policy_api_key:
        api = YouthPolicyAPI(policy_api_key, session)
    elif not args.no_api:
        print("[안내] YOUTHCENTER_POLICY_API_KEY가 없어 API 탐색을 건너뜁니다.")

    # 0) 수집계획 저장
    write_csv(
        out_dir / "00_공식사이트_검색키워드.csv",
        make_search_plan(),
        ["검색유형", "검색어/정책명", "지역범위", "공식URL", "비고"],
    )

    results: list[dict[str, str]] = []
    logs: list[dict[str, Any]] = []

    # 1) 온통청년 청년정책API 자동 탐색
    if api:
        discovered = api.discover_finance_policies(max_pages=max(1, args.max_pages))
        print(f"\n[자동탐색] 목표 지역 장학·금융 API 후보: {len(discovered)}건")
        for idx, api_obj in enumerate(discovered, 1):
            scope, _, _, _ = classify_api_target_region(api_obj)
            if args.region and scope != args.region:
                continue
            print(f"[API {idx}/{len(discovered)}] {clean_text(api_obj.get('plcyNm'))} ({scope})")
            try:
                row, log = collect_discovered_api_policy(api_obj, session)
                results.append(row)
                logs.append(log)
            except Exception as e:
                print(f"  -> 수집 실패: {e}")

    # 2) 부산 공식 정책 인덱스에서 API 누락 가능성이 있는 금융·장학 정책 추가 탐색
    if not args.no_local_index and (not args.region or args.region == "부산"):
        for scope, index_url in LOCAL_INDEX_SOURCES:
            try:
                links = discover_index_finance_links(session, index_url)
            except Exception as e:
                print(f"[공식 인덱스 경고] {index_url}: {e}")
                continue
            print(f"[공식 인덱스] {index_url}: 관련 링크 {len(links)}건")
            for name, url in links:
                if any(norm_name(r.get("정책명", "")) == norm_name(name) for r in results):
                    continue
                row, log = collect_local_index_policy(name, url, scope, session)
                logs.append(log)
                if row:
                    results.append(row)

    # 3) 기존 12개 정책은 '전체 목록'이 아니라 누락방지용 보완 목록으로만 사용.
    #    API/공식 인덱스에서 같은 정책이 이미 발견됐으면 다시 수집하지 않는다.
    existing = {norm_name(r.get("정책명", "")) for r in results}
    for seed in SUPPLEMENTAL_POLICY_SEEDS:
        if args.region and seed.expected_scope != args.region:
            continue
        if norm_name(seed.name) in existing:
            continue
        print(f"[누락방지 보완] {seed.name}")
        row, log = collect_one(seed, None, session)
        results.append(row)
        logs.append(log)
        existing.add(norm_name(seed.name))

    results = dedupe_rows(results)
    if args.region:
        results = [r for r in results if r.get("신청범위") == args.region]

    # 청년대상구분별/지역별 정렬
    youth_order = {"청년전용": 0, "청년포함": 1, "연령조건미표기": 2}
    scope_order = {"전국": 0, "부산": 1, "부산진구": 2, "사하구": 3}
    results.sort(key=lambda r: (
        scope_order.get(r.get("신청범위"), 9),
        youth_order.get(r.get("청년대상구분"), 9),
        r.get("정책명", ""),
    ))

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
                "정책명": x.get("seed", ""),
                "API검색어": x.get("api_query_used", ""),
                "API매칭점수": (
                    "자동탐색" if x.get("api_match_score") == -1.0
                    else f"{float(x.get('api_match_score', 0.0)):.2f}"
                ),
                "API정책번호": x.get("api_plcyNo", ""),
                "API정책명": x.get("api_plcyNm", ""),
                "API매칭검증": x.get("api_match_note", ""),
                "크롤링URL": " | ".join(x.get("crawl_urls", [])),
                "검증값보완필드": ", ".join(x.get("curated_fields", [])),
                "수집방식": "+".join(x.get("method", [])),
                "오류": " | ".join(x.get("errors", [])),
            }
            for x in logs
        ],
        ["정책명", "API검색어", "API매칭점수", "API정책번호", "API정책명", "API매칭검증", "크롤링URL", "검증값보완필드", "수집방식", "오류"],
    )

    # 과제 보고서용 집계
    counts: dict[tuple[str, str], int] = {}
    for r in results:
        key = (r.get("신청범위", EMPTY_UNKNOWN), r.get("청년대상구분", EMPTY_UNKNOWN))
        counts[key] = counts.get(key, 0) + 1
    summary_rows = [
        {"지역범위": scope, "청년대상구분": youth, "건수": count}
        for (scope, youth), count in sorted(counts.items())
    ]
    write_csv(
        out_dir / "05_지역_청년대상구분_집계.csv",
        summary_rows,
        ["지역범위", "청년대상구분", "건수"],
    )

    print("\n완료")
    print(f"- 총 {len(results)}건")
    for name in [
        "00_공식사이트_검색키워드.csv",
        "01_장학금융_정책수집결과.csv",
        "02_공식출처목록.csv",
        "03_확인필요항목.csv",
        "04_수집로그.csv",
        "05_지역_청년대상구분_집계.csv",
    ]:
        print(f"- {out_dir / name}")


if __name__ == "__main__":
    main()
