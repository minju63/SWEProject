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
    "BusanYouthPolicyResearchBot/1.9.0 "
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
    "청년대상구분",
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
    "소득조건",
    "최종학력",
    "현재 상태",
    "관심 분야",
    "현재 주거 형태",
    "가구 구성",
    "독립거주 여부",
    "혼인 상태",
    "주택 소유 여부",
    "세대주 여부",
    "주거급여 수급 여부",
    "특화대상",
    "조건근거URL",
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
    "수집방식",
]

# 최종 CSV에는 내보내지 않지만 API/크롤링 원문에서 조건을 추출하고
# 최종 선택형 컬럼(최종학력/현재 상태/특화대상)을 만들기 위해 내부적으로만 유지한다.
INTERNAL_CONDITION_COLUMNS = [
    "학력·재학조건",
    "취업상태",
    "특화대상_원문",
]
ROW_COLUMNS = [*OUTPUT_COLUMNS, *INTERNAL_CONDITION_COLUMNS]


EMPTY_UNKNOWN = "확인필요"
NO_LIMIT = "제한없음"
NOT_APPLICABLE = "해당없음"

# 조건값 의미를 전역에서 동일하게 사용한다.
# - 제한없음: 해당 조건 자체가 자격요건에 없음/무관함이 공식 근거로 확인됨
# - 확인필요: 공식 원문/API에서 해당 조건을 찾지 못했거나 판단 근거가 부족함
# - 해당없음: 해당 필드의 허용 선택지 어느 것에도 속하지 않음이 명확하게 확인됨
CONDITION_SENTINELS = {EMPTY_UNKNOWN, NO_LIMIT, NOT_APPLICABLE}

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
    "장학", "장학금", "학자금", "등록금", "대출", "융자", "이자지원",
    "저축", "적금", "통장", "자산형성", "금융", "신용회복", "보증", "장려금",
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

# API refUrl이 FAQ/마이페이지처럼 정책 원문이 아닌 곳을 가리키는 것으로 실제 확인된 경우,
# 현재 공식 정책 상세 페이지를 명시적으로 사용한다.
VERIFIED_OFFICIAL_SOURCE_OVERRIDES = {
    "청년 자산형성 지원(청년도약계좌)": "https://www.kinfa.or.kr/financialProduct/youthLeapAccount.do",
    "청년도약계좌": "https://www.kinfa.or.kr/financialProduct/youthLeapAccount.do",
    "복권기금 꿈사다리 장학사업": "https://www.kosaf.go.kr/ko/notice.do?mode=view&naviParam=DN%2C08%2C01%2C00&seqNo=20721",
    "청년 전월세 대출보증": "https://hf.go.kr/ko/sub02/sub02_01_04.do",
    "청년주택드림청약통장": "https://www.molit.go.kr/2024dreamaccount/main.jsp",
    "희망사다리장학금 1유형(중소기업 취업연계)": "https://www.kosaf.go.kr/ko/scholar.do?pg=scholarship05_14_01",
    "희망사다리장학금 2유형(고졸 후학습자)": "https://www.kosaf.go.kr/ko/notice.do?ctgrId1=0000000002&ctgrId2=0000000014&mode=view&page=1&searchStr=&searchType=&seqNo=21320",
    "부산청년 기쁨두배통장": "https://www.busan.go.kr/nbgosi/view?gosiGbn=A&sno=78998",
    "부산 청년 자산형성 지원(부산청년 기쁨두배통장)": "https://www.busan.go.kr/nbgosi/view?gosiGbn=A&sno=78998",
    "이공계 우수학생 국가장학금": "https://www.kosaf.go.kr/ko/scholar.do?pg=scholarship05_06_01&ttab1=1",
    "청년일자리 도약장려금": "https://www.work24.go.kr/wk/k/h/1200/retrieveYngJumpIndivSptfndIntro.do",
}

# 자동 API 값보다 현재 공식 페이지의 구체적 안내를 우선해야 하는 일부 정책.
# 범용 추론으로 퍼뜨리지 않고 실제 공식 근거를 확인한 정책만 allowlist 방식으로 보정한다.
VERIFIED_POLICY_FIELD_OVERRIDES: dict[str, dict[str, str]] = {
    "청년 전월세 대출보증": {
        "신청URL": EMPTY_UNKNOWN,
        "원문URL": "https://hf.go.kr/ko/sub02/sub02_01_04.do",
    },
    "복권기금 꿈사다리 장학사업": {
        # 온통청년 상담 URL은 장학금 신청 페이지가 아니므로 제거.
        "신청URL": EMPTY_UNKNOWN,
        "원문URL": "https://www.kosaf.go.kr/ko/notice.do?mode=view&naviParam=DN%2C08%2C01%2C00&seqNo=20721",
    },
    "생활안정자금 융자사업": {
        # 기존 personalInfoHist URL은 신청내역/마이페이지 성격이므로 실제 신청URL로 사용하지 않는다.
        "신청URL": EMPTY_UNKNOWN,
    },
    "청년전용 보증부 월세대출": {
        "연령조건_원문": "만 19세~34세",
        "최소연령": "19",
        "최대연령": "34",
        "신청URL": "https://enhuf.molit.go.kr/",
        "원문URL": "https://nhuf.molit.go.kr/FP/FP05/FP0502/FP05020701.jsp",
    },
    "청년전용 저리대출상품 운영": {
        # 실제 지원내용이 청년전용 버팀목전세자금과 일치하며 공식 FAQ의 연령요건을 적용.
        "연령조건_원문": "만 19세~34세",
        "최소연령": "19",
        "최대연령": "34",
        "신청URL": "https://enhuf.molit.go.kr/",
        "원문URL": "https://nhuf.molit.go.kr/FP/FP05/FP0502/FP05020301.jsp",
    },
    "청년주택드림청약통장": {
        "연령조건_원문": "만 19세~34세",
        "최소연령": "19",
        "최대연령": "34",
        "지원금액": "최대 연 4.5% 우대금리 / 이자소득 비과세 / 연 납입액 최대 300만원의 40% 소득공제",
        # 가입은 취급은행에서 진행되므로 특정 상품 상세페이지를 신청URL로 오인하지 않는다.
        "신청URL": EMPTY_UNKNOWN,
        "원문URL": "https://www.molit.go.kr/2024dreamaccount/main.jsp",
    },
    "부산 전세보증금 반환보증 보증료 지원": {
        "연령조건_원문": "청년(18~39세) 및 청년 외 신청 가능",
        "최소연령": EMPTY_UNKNOWN,
        "최대연령": EMPTY_UNKNOWN,
        "청년대상구분": "청년포함",
        "지원금액": "최대 40만원",
        "원문URL": "https://www.busan.go.kr/depart/reguarantee",
    },
    "부산 학자금 대출이자 지원": {
        "지원내용": "한국장학재단 학자금대출의 2025년 7월~2026년 6월까지 발생이자(1년분) 지원 / 발생이자 금액만큼 대출계좌별 원리금에서 상환(차감) 처리",
        "지원금액": "한국장학재단 학자금대출의 2025.7~2026.6 발생이자 지원",
        "신청시작일": "2026-07-06",
        "신청마감일": "2026-08-28",
        # menuCd=49는 사업 안내 상세페이지다. 실제 신청 폼 고정 URL은 공식 페이지에서 확인되지 않았다.
        "신청URL": EMPTY_UNKNOWN,
        "원문URL": "https://young.busan.go.kr/index.nm?menuCd=49",
    },
    "부산 청년 임차보증금 대출 및 대출이자 지원(머물자리론)": {
        "연령조건_원문": "만 19세~39세",
        "최소연령": "19",
        "최대연령": "39",
        "소득조건": "본인 연소득 6,000만원 이하 / 부부합산 연소득 1억원 이하",
        "지원내용": "임차보증금 최대 1억원 이내(임차보증금의 90% 범위) 대출 / 부산시 이자지원: 소득기준에 따라 2.0~3.0% 지원",
        # menuCd=0은 정책 상세페이지이며, 실제 신청 폼 URL은 공식 페이지에서 고정 URL로 확인되지 않았다.
        "신청URL": EMPTY_UNKNOWN,
        "원문URL": "https://young.busan.go.kr/index.nm?menuCd=0",
    },
    "부산 지역인재 장학금 지원": {
        # menuCd=164 역시 사업 안내 상세페이지이며 실제 신청 폼 URL과 구분한다.
        "신청URL": EMPTY_UNKNOWN,
        "원문URL": "https://young.busan.go.kr/index.nm?menuCd=164",
    },
    "(재)사하구장학회 저소득 대학생 장학": {
        # 공식 시행세칙상 추천·서류 제출 방식이며 온라인 신청페이지를 확인하지 못했다.
        "신청URL": EMPTY_UNKNOWN,
        "원문URL": "https://friend.saha.go.kr/portal/contents.do?mId=0507040000",
    },
    "주거안정월세대출": {
        # 공식 상품 안내에 온라인 신청처가 '기금e든든'으로 명시되어 있다.
        "신청URL": "https://enhuf.molit.go.kr/",
        "원문URL": "https://nhuf.molit.go.kr/FP/FP05/FP0502/FP05020201.jsp",
    },
    "희망사다리장학금 1유형(중소기업 취업연계)": {
        # 2026년 2학기 신규장학생 공식 일정으로 오래된 API 기간을 교정한다.
        "신청시작일": "2026-09-01",
        "신청마감일": "2026-09-18",
        "원문URL": "https://www.kosaf.go.kr/ko/scholar.do?pg=scholarship05_14_01",
    },
    "희망사다리장학금 2유형(고졸 후학습자)": {
        # 2026-09-17 공지에서 신청마감이 9월 30일 18시로 연장됨을 공식 확인.
        "신청시작일": "2026-09-01",
        "신청마감일": "2026-09-30",
        "원문URL": "https://www.kosaf.go.kr/ko/scholar.do?pg=scholarship05_16_01",
    },
    "이공계 우수학생 국가장학금": {
        # 기존 API/크롤링 결과에 한국장학재단 메인 메뉴 및 다른 사업 공지가 섞여
        # 지원대상/신청URL이 오염된 것을 현재 공식 사업 페이지로 교정한다.
        "지원대상_원문": "대한민국 국적을 소지한 자 / 국내 4년제 대학 자연과학·공학계열 학과(부)의 신입생 또는 국내 3학년 재학생 등 유형별 요건",
        "신청URL": EMPTY_UNKNOWN,
        "원문URL": "https://www.kosaf.go.kr/ko/scholar.do?pg=scholarship05_06_01&ttab1=1",
    },
    "청년일자리 도약장려금": {
        # 첨부 실행결과의 2025 기간·고용24 메인URL은 2026 공식 안내와 불일치한다.
        # 고용노동부 2026 사업지침과 고용24의 실제 온라인 신청 경로로 교정한다.
        "지원대상_원문": "2026년 청년일자리도약장려금 유형Ⅱ로 참여하고 6개월 이상 근속한 청년(개인)",
        "신청시작일": "2026-01-26",
        "신청마감일": EMPTY_UNKNOWN,
        "신청URL": "https://www.work24.go.kr/wk/k/h/1100/retrieveYngJumpIndivSptfndPayStatus.do",
        "원문URL": "https://www.work24.go.kr/wk/k/h/1200/retrieveYngJumpIndivSptfndIntro.do",
    },
}

# -----------------------------------------------------------------------------
# v11.6 공식 검증 및 크롤링 정제 보정
# -----------------------------------------------------------------------------
# 자동 크롤링이 메뉴/다른 섹션을 잘못 집은 것이 실제 실행결과에서 확인된 정책만
# 공식 원문으로 다시 검증하여 강제 교정한다.
# 이 표는 일반 추론 규칙이 아니며, 아래 정책명에만 적용된다.
VERIFIED_POLICY_FIELD_OVERRIDES.update({
    "일반 상환 학자금대출": {
        "지원내용": "학부생 및 대학원생에게 등록금·생활비 학자금대출을 지원하고 대출기간 동안 원리금을 분할 상환",
        "지원대상_원문": "국내 고등교육기관 학부생, 전문대의 전문기술석사 및 대학원생(재학생 및 입학·복학예정자 포함)인 대한민국 국민 등 공식 지원자격",
        "소득조건": "학부생·대학원생 학자금 지원구간 제한 없음",
        "제외대상": "중복지원, 부실자료 제출, 등록금 및 대출 차액 미상환자 등 공식 대출제한 대상",
        "원문URL": "https://www.kosaf.go.kr/ko/tuition.do?pg=tuition04_02_02p",
    },
    "청년전용 보증부 월세대출": {
        # 주택도시기금 공식 FAQ에서 직접 확인한 연령값. API의 '연령제한 없음'보다 우선한다.
        "연령조건_원문": "만 19세~34세",
        "최소연령": "19",
        "최대연령": "34",
        "청년대상구분": "청년전용",
        "지원대상_원문": "대출 신청일 현재 만 19세 이상~만 34세 이하 청년 단독세대주(예비세대주 포함)",
        # '거주여부 확인' 문장이 지역 거주자격으로 잘못 잡히는 현상을 차단한다.
        "거주조건_원문": EMPTY_UNKNOWN,
        "원문URL": "https://nhuf.molit.go.kr/FP/FP05/FP0502/FP05020701.jsp",
    },
    "주거안정월세대출": {
        # 기존 실행결과의 '월세금 지급방법'이 지원대상으로 잘못 들어온 값은 사용하지 않는다.
        "지원대상_원문": EMPTY_UNKNOWN,
        "거주조건_원문": EMPTY_UNKNOWN,
        "원문URL": "https://nhuf.molit.go.kr/FP/FP05/FP0502/FP05020201.jsp",
    },
    "주거안정장학금": {
        "연령조건_원문": "만 39세 이하",
        "최소연령": EMPTY_UNKNOWN,
        "최대연령": "39",
        "청년대상구분": "청년포함",
        "제외대상": "대학원생 제외",
        "신청방법": "한국장학재단 홈페이지 또는 모바일 앱에서 신청",
        "신청시작일": "2026-08-12",
        "신청마감일": "2026-09-09",
        "원문URL": "https://www.kosaf.go.kr/ko/notice.do?mode=view&naviParam=DN%2C08%2C01%2C00&seqNo=20886",
    },
    "다자녀 국가장학금": {
        "지원내용": "다자녀 가구의 등록금 부담 경감을 위한 국가장학금",
        "지원대상_원문": "대한민국 국적을 소지한 국내대학의 학자금 지원 9구간 이하 다자녀 가정의 미혼 대학생 / 다자녀 가구는 대한민국 국적 자녀 3명 이상 / 2023-2학기 이후 신·편입생은 입학 당시 만 39세 이하 조건",
        "소득조건": "학자금 지원구간 9구간 이하",
        "제외대상": EMPTY_UNKNOWN,
        "원문URL": "https://www.kosaf.go.kr/ko/scholar.do?pg=scholarship05_12_10",
    },
    "희망사다리장학금 1유형(중소기업 취업연계)": {
        "지원대상_원문": "대한민국 국적자로 사업 참여대학에 재학 중인 자 / 일반대 3학년 이상 또는 전문대 2학년 이상 / 중소·중견기업 취업 또는 창업 희망자·기취창업자 등 유형별 요건",
        "제외대상": EMPTY_UNKNOWN,
        "원문URL": "https://www.kosaf.go.kr/ko/scholar.do?pg=scholarship05_14_01",
    },
    "희망사다리장학금 2유형(고졸 후학습자)": {
        "지원대상_원문": "대한민국 국적의 대학 재학생 / 최종학력이 고졸인 자 / 직전학기 백분위 70점 이상 / 2026-07-01 기준 재직기간 2년 이상(중소·중견기업 재직자는 1년 이상) 등",
        "제외대상": EMPTY_UNKNOWN,
        # 한국장학재단 2026-09-17 연장 공지: 2학기 신규장학생 신청 9/1 09:00~9/30 18:00.
        "신청시작일": "2026-09-01",
        "신청마감일": "2026-09-30",
        "원문URL": "https://www.kosaf.go.kr/ko/notice.do?ctgrId1=0000000002&ctgrId2=0000000014&mode=view&page=1&searchStr=&searchType=&seqNo=21320",
    },
    "이공계 우수학생 국가장학금": {
        "학력·재학조건": "국내 4년제 대학 자연과학·공학계열 학과(부)의 신입생 또는 국내 3학년 재학생 등 유형별 요건",
        "제외대상": EMPTY_UNKNOWN,
        "원문URL": "https://www.kosaf.go.kr/ko/scholar.do?pg=scholarship05_06_01&ttab1=1",
    },
    "전문기술인재 장학금 지원": {
        "지원대상_원문": "대한민국 국적 소지자로서 사업 참여 전문대학 재학생 중 종합적 취업 역량 개발 노력과 성취가 우수한 학생",
        "학력·재학조건": "사업 참여 전문대학 정규과정 재학생 / 전문기술석사학위 과정 대학원생은 제외 / 신규장학생은 직전학기 이수학점·성적 등 공식 요건 적용",
        "지원금액": "Ⅰ유형 등록금 전액 + 생활비 학기당 250만원 / Ⅱ유형 등록금 전액",
        "제외대상": "전문기술석사학위 과정 대학원생, 동일 학기 한국장학재단 타 우수·취업연계 장학금 수혜자 등 공식 선발 제외대상",
        # 2026 학생 신청 공지의 종료연도 표기에 오류가 있어 마감일을 임의 보정하지 않는다.
        "신청시작일": "2026-03-09",
        "신청마감일": EMPTY_UNKNOWN,
        "신청URL": EMPTY_UNKNOWN,
        "원문URL": "https://www.kosaf.go.kr/ko/scholar.do?pg=scholarship05_12_01",
    },
    "부산청년 기쁨두배통장": {
        "학력·재학조건": "학적 조건 공식자료 미표기",
    },
    "학자금 대출 성실상환자 조기상환 지원": {
        "지원대상_원문": "신청일 기준 주민등록상 부산광역시에 주소를 둔 만 18~34세 이하 청년 중 한국장학재단 학자금대출 분할상환약정 체결 후 1년 이상 경과, 약정금액 50% 이상 상환, 연체 93일 미만 요건을 충족하는 자",
        "지원금액": "조기상환 지원금 최대 100만원",
        "거주조건_원문": "신청일 기준 주민등록상 부산광역시에 주소",
        "학력·재학조건": "학력·재학조건 공식자료 미표기",
        "제외대상": "타 지방자치단체에서 유사한 학자금대출 성실상환자 조기상환 지원을 받은 경우 지원 불가",
        "원문URL": "https://young.busan.go.kr/index.nm?menuCd=184",
    },
    "학자금 대출 신용도판단 정보등록자 신용회복": {
        "지원대상_원문": "만 18~34세 이하 한국장학재단 학자금대출 신용도판단정보 등록 부산거주 청년",
        "지원금액": "학자금 대출 분할상환약정 체결을 위한 초입금(채무금액의 5%) 지원",
        "거주조건_원문": "부산 거주",
        "학력·재학조건": "학력·재학조건 공식자료 미표기",
        "제외대상": "타 지자체 유사 학자금대출 신용회복 지원 수혜자 / 신용회복위원회 통합채무조정 신청자",
        "운영기관": "한국장학재단",
        "원문URL": "https://young.busan.go.kr/index.nm?menuCd=50",
    },
    "장병내일준비적금 지원": {
        "지원금액": "2024년부터 납입원금의 100% 매칭지원금 + 은행이자(약 5%) / 2025년 1월부터 개인별 월 납입한도 최대 55만원",
        "원문URL": "https://www.mnd.go.kr/mbshome/mbs/mnd/subview.jsp?id=mnd_011302000000",
    },
})

# 정책별 강제 보정값의 공식 근거. 01의 비고와 수집방식에 추적정보를 남긴다.
VERIFIED_POLICY_OVERRIDE_SOURCES: dict[str, str] = {
    "일반 상환 학자금대출": "한국장학재단 2026 일반 상환 학자금대출 공식 안내",
    "청년전용 보증부 월세대출": "주택도시기금 청년전용 보증부월세대출 공식 FAQ/상품안내",
    "주거안정월세대출": "주택도시기금 주거안정월세대출 공식 상품안내",
    "주거안정장학금": "한국장학재단 2026학년도 2학기 1차 주거안정장학금 신청 안내",
    "다자녀 국가장학금": "한국장학재단 2026 다자녀 국가장학금 공식 안내",
    "희망사다리장학금 1유형(중소기업 취업연계)": "한국장학재단 2026 희망사다리Ⅰ유형 공식 안내",
    "희망사다리장학금 2유형(고졸 후학습자)": "한국장학재단 2026-09-17 희망사다리Ⅱ유형 신청기간 연장 공식 공지",
    "이공계 우수학생 국가장학금": "한국장학재단 국가우수장학금(이공계) 공식 안내",
    "전문기술인재 장학금 지원": "한국장학재단 2026 전문기술인재장학금 공식 안내",
    "부산청년 기쁨두배통장": "부산광역시 공고 제2026-2363호(2026-08-03) 부산청년 기쁨두배통장 모집 공고",
    "학자금 대출 성실상환자 조기상환 지원": "부산청년플랫폼 공식 사업안내(menuCd=184)",
    "학자금 대출 신용도판단 정보등록자 신용회복": "부산청년플랫폼 공식 사업안내(menuCd=50)",
    "장병내일준비적금 지원": "국방부 장병내일준비적금 공식 안내",
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
        # 2026 부산광역시 공식 모집공고를 1차 크롤링하여 공고일/신청기간 오탐을 줄인다.
        official_url="https://www.busan.go.kr/nbgosi/view?gosiGbn=A&sno=78998",
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
# - '해당없음'은 어느 허용 선택지에도 해당하지 않음이 공식 근거로 명확할 때만 사용한다.
# - 정확한 신청 시작/마감일이 있는 정책은 아래 날짜를 채운 뒤 calc_status()가
#   실행 시점(TODAY)을 기준으로 모집예정/모집중/마감을 자동 계산한다.
# 시행기관은 사전값으로 추정하지 않는다.
# 다만 공식자료에 '시행기관/주관기관/주최기관/추진기관/시행주체'가 명시된 경우에 한해
# 해당 정책의 curated 항목에 allow_implementing_agency=True를 명시하여 보완할 수 있다.
# 단순 등록기관·사이트 운영기관·담당부서만으로는 시행기관을 만들지 않는다.
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
        },
        "source_note": "검증표: 한국장학재단 2026 국가장학금Ⅰ유형 안내",
    },
    "다자녀 국가장학금": {
        "fields": {
            "거주조건_원문": "지역 거주조건 공식자료 미표기 / 대한민국 국적 기준",
            "학력·재학조건": "국내대학 재학생 등 / 대한민국 국적 자녀 3명 이상 가정의 미혼 대학생",
            "취업상태": "취업상태 조건 공식자료 미표기",
            "소득조건": "학자금 지원구간 9구간 이하",
            "특화대상_원문": "다자녀",
            "지원대상_원문": "대한민국 국적 자녀 3명 이상 가정의 미혼 대학생 / 국내대학 재학생 등 / 학자금 지원구간 9구간 이하",
            "지원내용": "기초·차상위 등록금 전액 / 첫째·둘째: 1~3구간 연 610만원, 4~6구간 505만원, 7~8구간 465만원, 9구간 135만원 / 셋째 이상: 1~8구간 전액, 9구간 연 200만원",
            "지원금액": "기초·차상위 등록금 전액 / 첫째·둘째: 1~3구간 연 610만원, 4~6구간 505만원, 7~8구간 465만원, 9구간 135만원 / 셋째 이상: 1~8구간 전액, 9구간 연 200만원",
            "연령조건_원문": "조건부 만 39세 기준",
            "신청시작일": "2026-08-12",
            "신청마감일": "2026-09-09",
            "상시모집": "아니오",
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
            "특화대상_원문": "지역인재",
            "지원대상_원문": "부산 소재 대학 IT·상경 분야 재학생 / 일반대 3·4학년, 전문대 2학년 등 / 학자금 지원구간 9구간 이하",
            "지원내용": "1인 150만원 생활장학금",
            "지원금액": "1인 150만원",
            "연령조건_원문": "공식자료에 별도 연령조건 미표기",
            "신청시작일": "2026-06-30",
            "신청마감일": "2026-07-14",
            "상시모집": "아니오",
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
            "시행기관": "부산광역시(경제진흥원)",
        },
        "allow_implementing_agency": True,
        "source_note": "부산광역시 2026 부산청년 기쁨두배통장 모집 공고 / 2026 청년 자산형성지원 세출현황에서 시행주체=부산광역시(경제진흥원)",
        "source_url": "https://www.busan.go.kr/expdetail/view?curPage=59&schDbiz=6260000202330163&schYear=2026",
    },
    "(재)사하구장학회 저소득 대학생 장학": {
        "fields": {
            "거주조건_원문": "세대주 또는 보호자가 사하구에 신청일 현재 1년 이상 계속 거주",
            "거주기간_개월": "12",
            "학력·재학조건": "자립준비청년 등 저소득 대학생 포함",
            "취업상태": "취업상태 조건 공식자료 미표기",
            "소득조건": "시행세칙상 '생활이 어려운', '저소득 대학생'으로 규정 / 구체적 소득금액 기준 공식자료 미표기",
            "특화대상_원문": "저소득|자립준비청년",
            "지원대상_원문": "세대주 또는 보호자가 사하구에 신청일 현재 1년 이상 계속 거주 / 자립준비청년 등 저소득 대학생",
            "지원내용": "연간 학업보조비를 원칙으로 하며 수익·이사회 결정에 따라 지급",
            "지원금액": "정액 공식자료 미표기 / 연간 학업보조비를 원칙으로 하며 수익·이사회 결정에 따라 지급",
            "연령조건_원문": "공식자료에 별도 연령조건 미표기",
            "신청방법": "온라인 신청 없음 — 복지정책과장·동장 등 추천·서류 제출 방식",
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
        },
        "source_note": "검증표 보조 게시본: https://ribs.inu.ac.kr/bbs/inu/2006/417138/artclView.do",
    },
    "청년주택드림청약통장": {
        "fields": {
            "지원대상_원문": "만 19세~34세 / 직전년도 신고소득이 있는 연소득 5천만원 이하 근로·사업·기타소득자 / 무주택자",
        },
        "source_note": "국토교통부 청년주택드림청약 공식 안내(가입 대상자)",
        "source_url": "https://www.molit.go.kr/2024dreamaccount/main.jsp",
    },
    "이공계 연구생활장려금": {
        "fields": {
            "지원대상_원문": "2026년 이공계 연구생활장려금 참여대학의 이공계 대학원생",
        },
        "source_note": "과학기술정보통신부 2026-09-04 보도자료: 48개 대학, 약 5.5만명 이공계 대학원생 연구생활 지원",
        "source_url": "https://www.msit.go.kr/bbs/view.do?bbsSeqNo=94&mId=307&mPid=208&nttSeqNo=3187737&sCode=user",
    },
    "희망사다리장학금 1유형(중소기업 취업연계)": {
        "fields": {
            "지원대상_원문": "대한민국 국적자로 사업 참여대학에 재학 중인 자 / 일반대 3학년 이상 또는 전문대 2학년 이상 / 중소·중견기업 취업 또는 창업 희망자·기취창업자 등 유형별 요건",
            "원문URL": "https://www.kosaf.go.kr/ko/scholar.do?pg=scholarship05_14_01",
        },
        "source_note": "한국장학재단 2026년 2학기 중소기업 취업연계 장학금(희망사다리Ⅰ유형) 공식 안내",
        "source_url": "https://www.kosaf.go.kr/ko/scholar.do?pg=scholarship05_14_01",
    },
    "희망사다리장학금 2유형(고졸 후학습자)": {
        "fields": {
            "지원대상_원문": "대한민국 국적의 대학 재학생 / 최종학력이 고졸인 자 / 직전학기 백분위 70점 이상 / 2026-07-01 기준 재직기간 2년 이상(중소·중견기업 재직자는 1년 이상) 등",
            "원문URL": "https://www.kosaf.go.kr/ko/scholar.do?pg=scholarship05_16_01",
        },
        "source_note": "한국장학재단 2026년 2학기 고졸 후학습자 장학금(희망사다리Ⅱ유형) 공식 안내 및 2026-09-17 신청기간 연장 공지",
        "source_url": "https://www.kosaf.go.kr/ko/notice.do?ctgrId1=0000000002&ctgrId2=0000000014&mode=view&page=1&searchStr=&searchType=&seqNo=21320",
    },
    "부산 전세보증금 반환보증 보증료 지원": {
        "fields": {
            "시행기관": "부산광역시(구·군)",
            "신청시작일": "2026-01-01",
        },
        "allow_implementing_agency": True,
        "source_note": "부산광역시 2026 사업안내: 신청기간 2026.1.1.~계속(예산 소진 시까지) / 2026 세출현황에서 시행주체=부산광역시(구·군)",
        "source_url": "https://www.busan.go.kr/depart/reguarantee",
    },
    "부산 청년 임차보증금 대출 및 대출이자 지원(머물자리론)": {
        "fields": {
            "시행기관": "부산광역시",
            "기타조건": "2026년 신규신청은 1월~11월 매월 1일 09:00~10일 18:00 접수(계약유형별 신청시기 세부조건 별도)",
        },
        "allow_implementing_agency": True,
        "source_note": "부산청년플랫폼 2026 사업안내(월별 반복 접수) / 부산광역시 2026 세출현황 시행주체=부산광역시. 반복 접수이므로 단일 시작·마감일로 임의 정규화하지 않음.",
        "source_url": "https://young.busan.go.kr/index.nm?menuCd=0",
    },
    "부산 전세피해 임차인 버팀목 전세자금 대출이자 지원사업": {
        "fields": {
            "시행기관": "부산광역시",
            "원문URL": "https://www.busan.go.kr/depart/charterdamage001/1712433",
        },
        "allow_implementing_agency": True,
        "source_note": "부산광역시 2026 전세사기피해자등 금융·주거지원 공식 공고에 해당 대출이자 지원사업 명시 / 2026 세출현황 시행주체=부산광역시. 공고상 신청기간은 '사업별 상이'라 개별 시작·마감일은 추정하지 않음.",
        "source_url": "https://www.busan.go.kr/depart/charterdamage001/1712433",
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
    curated_key = resolve_curated_key(seed.name, seed.expected_scope)
    item = CURATED_FALLBACKS.get(curated_key or "", {})
    fields = item.get("fields", {})
    filled: list[str] = []

    # 기존 12개 수동 검증 정책의 연령정보는 API의 일반화된 연령값보다 우선한다.
    # 같은 정책이 API에서 별칭으로 발견돼도 resolve_curated_key()로 검증표와 연결한다.
    curated_age_raw = clean_text(fields.get("연령조건_원문"))
    if curated_age_raw:
        before = (
            clean_text(row.get("연령조건_원문")),
            clean_text(row.get("최소연령")),
            clean_text(row.get("최대연령")),
        )
        row["연령조건_원문"] = curated_age_raw

        curated_min = clean_text(fields.get("최소연령"))
        curated_max = clean_text(fields.get("최대연령"))

        # 숫자 정규화값이 검증표에 직접 없으면 검증된 원문에서 보수적으로 파싱한다.
        parsed_min, parsed_max, _ = extract_age(curated_age_raw)
        if any(k in curated_age_raw for k in ["미표기", "별도 연령조건"]):
            row["최소연령"] = EMPTY_UNKNOWN
            row["최대연령"] = EMPTY_UNKNOWN
        else:
            row["최소연령"] = curated_min or parsed_min or EMPTY_UNKNOWN
            row["최대연령"] = curated_max or parsed_max or EMPTY_UNKNOWN

        after = (
            clean_text(row.get("연령조건_원문")),
            clean_text(row.get("최소연령")),
            clean_text(row.get("최대연령")),
        )
        if after != before:
            for col in ["연령조건_원문", "최소연령", "최대연령"]:
                if col not in filled:
                    filled.append(col)

    # 1) 정책별 검증표 필드 보완
    # 시행기관은 공식자료가 시행 역할을 명시한 항목만 별도 opt-in으로 허용한다.
    allow_implementing_agency = bool(item.get("allow_implementing_agency"))
    for key, value in fields.items():
        if key not in row:
            continue
        if key == "시행기관" and not allow_implementing_agency:
            continue
        value = clean_text(value)
        if not value:
            continue
        if row.get(key) in {"", EMPTY_UNKNOWN}:
            row[key] = value
            filled.append(key)

    # 2) 시행기관은 기본적으로 curated fallback에서 차단된다.
    #    단, 공식자료에 시행기관/주관기관/주최기관/추진기관/시행주체가 명시되어
    #    allow_implementing_agency=True로 검증한 정책만 위에서 보완한다.

    # 3) 국가 장학·학자금 사업은 한국장학재단을 운영기관 fallback으로만 사용한다.
    #    API/크롤링에서 운영기관이 이미 확인된 경우에는 덮어쓰지 않는다.
    operating_agency = clean_text(CURATED_OPERATING_AGENCY.get(curated_key or seed.name))
    if operating_agency and row.get("운영기관") in {"", EMPTY_UNKNOWN}:
        row["운영기관"] = operating_agency
        if "운영기관" not in filled:
            filled.append("운영기관")

    note = clean_text(item.get("source_note"))
    source_url = normalize_source_url(item.get("source_url"))
    if source_url and is_official_url(source_url):
        note = as_joined([note, f"공식검증출처={source_url}"])
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



# -----------------------------------------------------------------------------
# v11.9 프로필/맞춤추천 선택형 조건 컬럼 - 중복 컬럼 통합
# -----------------------------------------------------------------------------
# 원칙
# - 최종 CSV에서 학력·재학조건→최종학력, 취업상태→현재 상태, 특화대상_원문→특화대상으로 통합한다.
# - 원문/중간 3개 컬럼은 내부 추출용으로만 유지하고 CSV에는 출력하지 않는다.
# - PROFILE_COLUMNS에는 사용자가 정한 선택값만 저장한다.
# - 제한없음: 원문에 조건 없음/무관이 명시된 경우만 사용한다.
# - 확인필요: 원문에서 조건을 찾지 못했거나 판단 근거가 부족한 경우 사용한다.
# - 해당없음: 허용 선택지 어느 것에도 해당하지 않음이 명확한 경우만 사용한다.
# - 현재 43개 정책은 사용자가 제공한 CSV의 검토 완료 값을 우선 적용한다.
# - 새 정책만 API/공식 원문에서 명시적으로 확인되는 값을 보수적으로 자동 태깅한다.
# - 복수 선택값은 "|"로 연결한다.
PROFILE_COLUMNS = [
    "최종학력",
    "현재 상태",
    "관심 분야",
    "현재 주거 형태",
    "가구 구성",
    "독립거주 여부",
    "혼인 상태",
    "주택 소유 여부",
    "세대주 여부",
    "주거급여 수급 여부",
    "특화대상",
]

PROFILE_ALLOWED_VALUES: dict[str, tuple[str, ...]] = {
    "최종학력": (
        "중학교 졸업 이하",
        "고등학교 졸업",
        "대학교 졸업-(2년제|4년제)",
        "대학원 졸업-(석사|박사)",
    ),
    "현재 상태": (
        "고등학생",
        "대학생(재학|휴학)",
        "대학원생",
        "취업준비생",
        "직장인",
        "자영업자",
        "창업준비생",
        "기타",
    ),
    "관심 분야": ("취업·진로", "주거·생활", "장학·금융", "문화", "공간·시설"),
    "현재 주거 형태": ("월세", "전세", "기숙사·생활관", "공공임대", "자가"),
    "가구 구성": ("1인 거주", "배우자와 거주", "가족과 거주", "공동거주"),
    "독립거주 여부": ("부모와 별도 거주", "부모와 함께 거주"),
    "혼인 상태": ("미혼", "기혼", "예비신혼부부", "신혼부부"),
    "주택 소유 여부": ("무주택", "유주택"),
    "세대주 여부": ("세대주", "예비세대주", "세대원"),
    "주거급여 수급 여부": ("수급 중", "수급하지 않음"),
    "특화대상": (
        "다자녀가구",
        "중소·중견기업 재직자",
        "차상위계층",
        "기초생활수급자",
        "한부모가정",
        "장애인",
        "농업인",
        "군인",
        "지역인재",
        "신혼부부",
        "신생아·영유아 가구",
        "자립준비청년",
        "주거취약계층",
        "전세사기 피해자",
    ),
}

PROFILE_VERIFIED_POLICY_MAP: dict[str, dict[str, str]] = {'미소금융 청년 미래이음 대출': {'현재 상태': '취업준비생|직장인|자영업자', '특화대상': '기초생활수급자|차상위계층'},
 '청년 자산형성 지원(청년도약계좌)': {},
 '청년 전월세 대출보증': {'현재 주거 형태': '전세', '주택 소유 여부': '무주택'},
 '청년미래적금': {'현재 상태': '직장인|자영업자'},
 '청년전용 보증부 월세대출': {'현재 주거 형태': '월세', '가구 구성': '1인 거주', '주택 소유 여부': '무주택', '세대주 여부': '세대주|예비세대주'},
 '청년전용 저리대출상품 운영': {'현재 주거 형태': '전세', '주택 소유 여부': '무주택', '세대주 여부': '세대주|예비세대주'},
 '청년주택드림청약통장': {'주택 소유 여부': '무주택'},
 '2026학년도 2학기 AI학업장려 학자금대출': {'현재 상태': '대학생(재학|휴학)', '특화대상': '장애인'},
 '고교 취업연계 장려금 지원': {'현재 상태': '고등학생'},
 '다자녀 국가장학금': {'현재 상태': '대학생(재학|휴학)', '혼인 상태': '미혼', '특화대상': '다자녀가구'},
 '복권기금 꿈사다리 장학사업': {'현재 상태': '고등학생', '특화대상': '기초생활수급자|차상위계층|한부모가정'},
 '생활안정자금 융자사업': {'현재 상태': '직장인|자영업자'},
 '일반 상환 학자금대출': {'현재 상태': '대학생(재학|휴학)|대학원생'},
 '주거안정장학금': {'현재 상태': '대학생(재학|휴학)', '현재 주거 형태': '월세|기숙사·생활관', '독립거주 여부': '부모와 별도 거주', '혼인 상태': '미혼', '특화대상': '기초생활수급자|차상위계층'},
 '청년 주택드림 디딤돌 대출': {'주택 소유 여부': '무주택', '세대주 여부': '세대주'},
 '청년내일저축계좌': {'현재 상태': '직장인|자영업자', '특화대상': '기초생활수급자|차상위계층'},
 '청년일자리 도약장려금': {'현재 상태': '직장인'},
 '청년창업농장학금': {'현재 상태': '대학생(재학|휴학)'},
 '취업 후 상환 학자금대출': {'현재 상태': '대학생(재학|휴학)|대학원생', '특화대상': '자립준비청년'},
 '국가근로장학금': {'현재 상태': '대학생(재학|휴학)', '특화대상': '장애인|자립준비청년'},
 '국가장학금Ⅰ유형': {'현재 상태': '대학생(재학|휴학)'},
 '신생아 특례 구입·전세대출': {'주택 소유 여부': '무주택', '세대주 여부': '세대주|예비세대주', '특화대상': '신생아·영유아 가구'},
 '이공계 연구생활장려금': {'현재 상태': '대학원생'},
 '이공계 우수학생 국가장학금': {'현재 상태': '대학생(재학|휴학)'},
 '장기간부 도약적금': {'현재 상태': '직장인', '특화대상': '군인'},
 '장병내일준비적금 지원': {'현재 상태': '기타', '특화대상': '군인'},
 '전문기술인재 장학금 지원': {'현재 상태': '대학생(재학|휴학)'},
 '전문대학 글로벌 현장학습': {'현재 상태': '대학생(재학|휴학)'},
 '주거안정월세대출': {'현재 주거 형태': '월세', '주택 소유 여부': '무주택', '세대주 여부': '세대주|예비세대주'},
 '희망사다리장학금 1유형(중소기업 취업연계)': {'현재 상태': '대학생(재학|휴학)'},
 '희망사다리장학금 2유형(고졸 후학습자)': {'최종학력': '고등학교 졸업', '현재 상태': '대학생(재학|휴학)|직장인', '특화대상': '중소·중견기업 재직자'},
 '부산 청년 신용회복 지원': {},
 '부산 청년 임차보증금 대출 및 대출이자 지원(머물자리론)': {'현재 주거 형태': '전세|월세', '주택 소유 여부': '무주택', '세대주 여부': '세대주', '주거급여 수급 여부': '수급하지 않음'},
 '부산 청년 자산형성 지원(부산청년 기쁨두배통장)': {'현재 상태': '직장인|자영업자'},
 '학자금 대출 성실상환자 조기상환 지원': {},
 '학자금 대출 신용도판단 정보등록자 신용회복': {},
 '부산 전세보증금 반환보증 보증료 지원': {'현재 주거 형태': '전세', '주택 소유 여부': '무주택', '특화대상': '신혼부부'},
 '부산 전세피해 임차인 버팀목 전세자금 대출이자 지원사업': {'현재 주거 형태': '전세', '주택 소유 여부': '무주택', '주거급여 수급 여부': '수급하지 않음', '특화대상': '전세사기 피해자'},
 '부산 지역인재 장학금 지원': {'현재 상태': '대학생(재학|휴학)', '특화대상': '지역인재'},
 '부산 학자금 대출이자 지원': {'현재 상태': '대학생(재학|휴학)|대학원생|취업준비생'},
 '취업장려금': {'최종학력': '대학교 졸업-(2년제|4년제)', '현재 상태': '직장인', '특화대상': '지역인재'},
 '(재)부산진구장학회 대학생 장학금': {'현재 상태': '대학생(재학|휴학)'},
 '(재)사하구장학회 저소득 대학생 장학': {'현재 상태': '대학생(재학|휴학)', '특화대상': '자립준비청년'}}

PROFILE_VERIFIED_SOURCE_MAP: dict[str, str] = {'미소금융 청년 미래이음 대출': 'https://www.kinfa.or.kr/counselingSupport/centerSmileFind.do?searchKeyword2=00121',
 '청년 자산형성 지원(청년도약계좌)': 'https://www.kinfa.or.kr/financialProduct/youthLeapAccount.do',
 '청년 전월세 대출보증': 'https://hf.go.kr/ko/sub02/sub02_01_04.do',
 '청년미래적금': 'https://www.fill4young.kinfa.or.kr',
 '청년전용 보증부 월세대출': 'https://nhuf.molit.go.kr/FP/FP05/FP0502/FP05020701.jsp',
 '청년전용 저리대출상품 운영': 'https://nhuf.molit.go.kr/FP/FP05/FP0502/FP05020301.jsp',
 '청년주택드림청약통장': 'https://www.molit.go.kr/2024dreamaccount/main.jsp',
 '2026학년도 2학기 AI학업장려 학자금대출': 'https://www.kosaf.go.kr/ko/tuition.do?pg=tuition19',
 '고교 취업연계 장려금 지원': 'https://www.hifive.go.kr/; https://www.kosaf.go.kr/ko/scholar.do?pg=scholarship05_18_01',
 '다자녀 국가장학금': 'https://www.kosaf.go.kr/ko/scholar.do?pg=scholarship05_12_10',
 '복권기금 꿈사다리 장학사업': 'https://www.kosaf.go.kr/ko/notice.do?mode=view&naviParam=DN%2C08%2C01%2C00&seqNo=20721',
 '생활안정자금 융자사업': 'https://welfare.comwel.or.kr/default/page.do?mCode=B010010010; '
                'https://www.bokjiro.go.kr/ssis-tbu/twataa/wlfareInfo/moveTWAT52011M.do?wlfareInfoId=WLF00000044&wlfareInfoReldBztpCd=01',
 '일반 상환 학자금대출': 'https://www.kosaf.go.kr/ko/tuition.do?pg=tuition04_02_02p',
 '주거안정장학금': 'https://www.kosaf.go.kr/ko/notice.do?mode=view&naviParam=DN%2C08%2C01%2C00&seqNo=20886',
 '청년 주택드림 디딤돌 대출': 'https://nhuf.molit.go.kr/FP/FP05/FP0503/FP05030901.jsp',
 '청년내일저축계좌': 'https://www.bokjiro.go.kr/ssis-tbu/ssis-tbu/twataa/wlfareInfo/moveTWAT52011M.do?wlfareInfoId=WLF00000060',
 '청년일자리 도약장려금': 'https://www.work24.go.kr/wk/k/h/1200/retrieveYngJumpIndivSptfndIntro.do',
 '청년창업농장학금': 'https://www.rhof.or.kr/; https://www.rhof.or.kr/sub/maf_coyb_dept.pdf',
 '취업 후 상환 학자금대출': 'https://www.kosaf.go.kr/ko/tuition.do?pg=tuition06_02_01&naviParam=HD,01,03,01,02',
 '국가근로장학금': 'https://www.kosaf.go.kr/',
 '국가장학금Ⅰ유형': 'https://www.kosaf.go.kr/ko/scholar.do?pg=scholarship05_12_01_01_02p',
 '신생아 특례 구입·전세대출': 'https://nhuf.molit.go.kr/FP/FP05/FP0502/FP05021401.jsp',
 '이공계 연구생활장려금': 'https://www.nrf.re.kr/biz/info/notice/view?menu_no=378&page=&nts_no=234580&biz_no=645&target=&biz_not_gubn=notice&search_type=NTS_TITLE&search_keyword1=',
 '이공계 우수학생 국가장학금': 'https://www.kosaf.go.kr/ko/scholar.do?pg=scholarship05_06_01&ttab1=1; '
                   'https://www.kosaf.go.kr/ko/notice.do?mode=view&page=1&searchStr=%EC%9D%B4%EA%B3%B5%EA%B3%84&seqNo=20847',
 '장기간부 도약적금': 'https://www.imnd.or.kr/user/ltogs/check.go',
 '장병내일준비적금 지원': 'https://www.mnd.go.kr/mbshome/mbs/mnd/subview.jsp?id=mnd_011302000000',
 '전문기술인재 장학금 지원': 'https://www.kosaf.go.kr/ko/scholar.do?pg=scholarship05_12_01',
 '전문대학 글로벌 현장학습': 'https://www.kcce.or.kr/web/majorBusiness/webInternationExchange.do',
 '주거안정월세대출': 'https://nhuf.molit.go.kr/FP/FP05/FP0502/FP05020201.jsp; '
             'https://m.myhome.go.kr/hws/portal/cont/selectResidentialMonthlyRentLoanView.do',
 '희망사다리장학금 1유형(중소기업 취업연계)': 'https://www.kosaf.go.kr/ko/scholar.do?pg=scholarship05_14_01',
 '희망사다리장학금 2유형(고졸 후학습자)': 'https://www.kosaf.go.kr/ko/notice.do?ctgrId1=0000000002&ctgrId2=0000000014&mode=view&page=1&searchStr=&searchType=&seqNo=21320',
 '부산 청년 신용회복 지원': 'https://young.busan.go.kr/index.nm?menuCd=54',
 '부산 청년 임차보증금 대출 및 대출이자 지원(머물자리론)': 'https://young.busan.go.kr/index.nm?menuCd=0',
 '부산 청년 자산형성 지원(부산청년 기쁨두배통장)': 'https://young.busan.go.kr/index.nm?menuCd=53',
 '학자금 대출 성실상환자 조기상환 지원': 'https://young.busan.go.kr/index.nm?menuCd=184',
 '학자금 대출 신용도판단 정보등록자 신용회복': 'https://young.busan.go.kr/index.nm?menuCd=50',
 '부산 전세보증금 반환보증 보증료 지원': 'https://www.busan.go.kr/depart/reguarantee',
 '부산 전세피해 임차인 버팀목 전세자금 대출이자 지원사업': 'https://www.busan.go.kr/depart/charterdamage001/1662197',
 '부산 지역인재 장학금 지원': 'https://young.busan.go.kr/index.nm?menuCd=164',
 '부산 학자금 대출이자 지원': 'https://young.busan.go.kr/index.nm?menuCd=49',
 '취업장려금': 'https://young.busan.go.kr/index.nm?menuCd=230',
 '(재)부산진구장학회 대학생 장학금': 'https://busanjinsf.kr/',
 '(재)사하구장학회 저소득 대학생 장학': 'https://friend.saha.go.kr/portal/contents.do?mId=0507040000'}

PROFILE_POLICY_ALIASES: dict[str, str] = {
    norm_name("부산지역인재 장학금"): "부산 지역인재 장학금 지원",
    norm_name("부산지역인재 장학금 지원"): "부산 지역인재 장학금 지원",
    norm_name("부산광역시 대학(원)생 학자금대출 이자지원"): "부산 학자금 대출이자 지원",
    norm_name("학자금 대출이자 지원"): "부산 학자금 대출이자 지원",
    norm_name("부산 대학생 학자금 대출이자 지원"): "부산 학자금 대출이자 지원",
    norm_name("부산 학자금대출 이자지원"): "부산 학자금 대출이자 지원",
    norm_name("부산청년 기쁨두배통장"): "부산 청년 자산형성 지원(부산청년 기쁨두배통장)",
    norm_name("부산 청년 자산형성 지원(부산청년 기쁨두배통장)"): "부산 청년 자산형성 지원(부산청년 기쁨두배통장)",
    norm_name("부산 전세피해 임차인 버팀목 전세자금 대출이자 지원"): "부산 전세피해 임차인 버팀목 전세자금 대출이자 지원사업",
}


def _append_allowed(out: list[str], column: str, value: str) -> None:
    if value in PROFILE_ALLOWED_VALUES[column] and value not in out:
        out.append(value)


def _profile_join(values: Iterable[str]) -> str:
    out: list[str] = []
    for value in values:
        value = clean_text(value)
        if value and value not in out:
            out.append(value)
    return "|".join(out)


# 선택형 조건별로 '제한없음/해당없음'을 명시적으로 판정할 때만 사용하는 용어.
# 단순히 값이 안 잡혔다는 이유로 제한없음이나 해당없음을 만들지 않는다.
PROFILE_FIELD_TERMS: dict[str, tuple[str, ...]] = {
    "최종학력": ("최종학력", "학력", "학적", "재학"),
    "현재 상태": ("현재 상태", "취업상태", "취업 상태", "재직상태", "근로상태"),
    "현재 주거 형태": ("현재 주거 형태", "주거형태", "주거 형태", "거주형태", "거주 형태"),
    "가구 구성": ("가구 구성", "가구형태", "가구 형태"),
    "독립거주 여부": ("독립거주", "독립 거주", "부모 동거", "부모와 거주"),
    "혼인 상태": ("혼인 상태", "혼인상태", "결혼 여부"),
    "주택 소유 여부": ("주택 소유 여부", "주택소유", "주택 소유"),
    "세대주 여부": ("세대주 여부", "세대주"),
    "주거급여 수급 여부": ("주거급여 수급 여부", "주거급여"),
    "특화대상": ("특화대상", "특화 대상", "우대대상", "우대 대상"),
}


def _explicit_condition_marker(column: str, text: str) -> str:
    """
    원문에 해당 조건의 의미가 직접 적혀 있을 때만 sentinel 값을 반환한다.

    - 조건 없음/무관/제한 없음 -> 제한없음
    - 해당 없음/적용 대상 아님/비대상 -> 해당없음
    - 그 외 또는 근거 부족 -> 빈 문자열(호출부에서 확인필요 처리)
    """
    t = clean_text(text)
    if not t:
        return ""

    terms = PROFILE_FIELD_TERMS.get(column, (column,))
    group = "(?:" + "|".join(re.escape(term) for term in terms) + ")"

    no_limit_pat = rf"{group}.{{0,24}}(?:조건\s*없음|제한\s*없음|무관|관계\s*없음|상관\s*없음)"
    not_applicable_pat = rf"{group}.{{0,24}}(?:해당\s*없음|적용\s*대상\s*아님|비대상)"

    if re.search(not_applicable_pat, t):
        return NOT_APPLICABLE
    if re.search(no_limit_pat, t):
        return NO_LIMIT
    return ""


def _profile_result(
    column: str,
    values: Iterable[str],
    blob: str,
    *,
    direct_values: Iterable[Any] = (),
) -> str:
    """선택값 > 명시 sentinel > 확인필요 순으로 결과를 확정한다."""
    joined = _profile_join(values)
    if joined:
        return joined

    # 내부 원문 필드 자체가 이미 검증된 sentinel 값이면 그대로 보존한다.
    direct = [clean_text(v) for v in direct_values]
    if NOT_APPLICABLE in direct:
        return NOT_APPLICABLE
    if NO_LIMIT in direct:
        return NO_LIMIT

    marker = _explicit_condition_marker(column, blob)
    return marker or EMPTY_UNKNOWN


def _verified_profile_key(policy_name: str) -> str | None:
    n = norm_name(policy_name)
    alias_name = PROFILE_POLICY_ALIASES.get(n)
    if alias_name:
        return alias_name
    for name in PROFILE_VERIFIED_POLICY_MAP:
        if norm_name(name) == n:
            return name
    return None


def _verified_profile_mapping(policy_name: str) -> dict[str, str] | None:
    key = _verified_profile_key(policy_name)
    return PROFILE_VERIFIED_POLICY_MAP.get(key) if key else None


def _profile_condition_source(policy_name: str, row: dict[str, str]) -> str:
    key = _verified_profile_key(policy_name)
    if key:
        source = clean_text(PROFILE_VERIFIED_SOURCE_MAP.get(key))
        if source:
            return source
    source = clean_text(row.get("원문URL"))
    if source and source != EMPTY_UNKNOWN and is_official_url(source):
        return source
    return ""


def infer_profile_columns(row: dict[str, str]) -> dict[str, str]:
    """
    1) 기존 43개는 제공 CSV 검토값을 그대로 적용.
    2) 새 정책은 긍정 자격조건에 명시된 값만 자동 태깅.
    제외대상 문구는 긍정 조건 추론에 사용하지 않는다.
    """
    policy_name = clean_text(row.get("정책명"))
    verified = _verified_profile_mapping(policy_name)
    if verified is not None:
        # 검토 완료 매핑에 값이 있으면 그대로 사용한다.
        # 매핑에 값이 없다는 사실만으로 '제한없음'이나 '해당없음'을 만들지 않는다.
        out = {c: clean_text(verified.get(c)) or EMPTY_UNKNOWN for c in PROFILE_COLUMNS}
        out["관심 분야"] = clean_text(verified.get("관심 분야")) or "장학·금융"
        out["조건근거URL"] = _profile_condition_source(policy_name, row) or EMPTY_UNKNOWN
        return out

    blob = as_joined([
        row.get("정책명"),
        row.get("지원대상_원문"),
        row.get("거주조건_원문"),
        row.get("학력·재학조건"),
        row.get("취업상태"),
        row.get("소득조건"),
        row.get("특화대상_원문"),
        row.get("기타조건"),
    ], sep=" ")

    education: list[str] = []
    if re.search(r"중졸|중학교\s*졸업\s*이하", blob):
        _append_allowed(education, "최종학력", "중학교 졸업 이하")
    if re.search(r"고졸|고등?학교\s*졸업", blob):
        _append_allowed(education, "최종학력", "고등학교 졸업")
    if re.search(r"(?:전문대|대학교|대학)\s*졸업|대졸", blob):
        _append_allowed(education, "최종학력", "대학교 졸업-(2년제|4년제)")
    if re.search(r"(?:석사|박사).{0,12}(?:학위|졸업)|대학원\s*졸업", blob):
        _append_allowed(education, "최종학력", "대학원 졸업-(석사|박사)")

    status: list[str] = []
    if re.search(r"고등학생|고교\s*재학|고등?학교\s*재학", blob):
        _append_allowed(status, "현재 상태", "고등학생")
    if re.search(r"대학\(원\)생", blob):
        _append_allowed(status, "현재 상태", "대학생(재학|휴학)")
        _append_allowed(status, "현재 상태", "대학원생")
    else:
        if re.search(r"대학원생|대학원.{0,10}(?:재학|휴학|입학|복학)", blob):
            _append_allowed(status, "현재 상태", "대학원생")
        if re.search(r"대학생|학부생|전문대.{0,10}(?:재학|휴학|입학|복학)|대학교?.{0,10}(?:재학|휴학|입학|복학)", blob):
            _append_allowed(status, "현재 상태", "대학생(재학|휴학)")
    if re.search(r"취업준비|구직|미취업", blob):
        _append_allowed(status, "현재 상태", "취업준비생")
    if re.search(r"직장인|재직자|재직\s*중|근로자|근로\s*중|기취업", blob):
        _append_allowed(status, "현재 상태", "직장인")
    if re.search(r"자영업자|소상공인|개인사업자|사업자|기창업", blob):
        _append_allowed(status, "현재 상태", "자영업자")
    if re.search(r"창업\s*(?:준비|희망)|예비창업", blob):
        _append_allowed(status, "현재 상태", "창업준비생")

    housing: list[str] = []
    if "월세" in blob:
        _append_allowed(housing, "현재 주거 형태", "월세")
    if "전세" in blob or "임차보증금" in blob:
        _append_allowed(housing, "현재 주거 형태", "전세")
    if "기숙사" in blob or "생활관" in blob:
        _append_allowed(housing, "현재 주거 형태", "기숙사·생활관")
    if "공공임대" in blob:
        _append_allowed(housing, "현재 주거 형태", "공공임대")
    if re.search(r"자가\s*(?:거주|주택)|자가주택", blob):
        _append_allowed(housing, "현재 주거 형태", "자가")

    household: list[str] = []
    if re.search(r"1\s*인\s*(?:가구|거주)", blob):
        _append_allowed(household, "가구 구성", "1인 거주")
    if re.search(r"배우자와\s*거주", blob):
        _append_allowed(household, "가구 구성", "배우자와 거주")
    if re.search(r"(?:부모|가족)와\s*(?:함께\s*)?거주", blob):
        _append_allowed(household, "가구 구성", "가족과 거주")
    if re.search(r"공동\s*거주", blob):
        _append_allowed(household, "가구 구성", "공동거주")

    independent: list[str] = []
    if re.search(r"부모와\s*(?:별도|분리)\s*거주|부모와\s*주소.*다름", blob):
        _append_allowed(independent, "독립거주 여부", "부모와 별도 거주")
    if re.search(r"부모와\s*(?:함께|동일)\s*거주|부모와\s*동거", blob):
        _append_allowed(independent, "독립거주 여부", "부모와 함께 거주")

    marriage: list[str] = []
    if "예비신혼부부" in blob:
        _append_allowed(marriage, "혼인 상태", "예비신혼부부")
    if "신혼부부" in blob:
        _append_allowed(marriage, "혼인 상태", "신혼부부")
    if "미혼" in blob:
        _append_allowed(marriage, "혼인 상태", "미혼")
    if re.search(r"(?<!미)기혼", blob):
        _append_allowed(marriage, "혼인 상태", "기혼")

    ownership: list[str] = []
    if "무주택" in blob:
        _append_allowed(ownership, "주택 소유 여부", "무주택")
    if re.search(r"유주택|주택\s*소유자", blob) and "무주택" not in blob:
        _append_allowed(ownership, "주택 소유 여부", "유주택")

    headship: list[str] = []
    if "예비세대주" in blob:
        _append_allowed(headship, "세대주 여부", "예비세대주")
    if re.search(r"단독세대주|(?<!예비)세대주", blob):
        _append_allowed(headship, "세대주 여부", "세대주")
    if re.search(r"신청자.{0,12}세대원|세대원인\s*신청자", blob):
        _append_allowed(headship, "세대주 여부", "세대원")

    housing_benefit: list[str] = []
    if re.search(r"주거급여.{0,12}(?:미수급|수급하지\s*않|비수급)", blob):
        _append_allowed(housing_benefit, "주거급여 수급 여부", "수급하지 않음")
    elif re.search(r"주거급여.{0,12}수급(?:자|\s*중)", blob) and not re.search(r"주거급여.{0,20}(?:제외|불가)", blob):
        _append_allowed(housing_benefit, "주거급여 수급 여부", "수급 중")

    special: list[str] = []
    if "다자녀" in blob:
        _append_allowed(special, "특화대상", "다자녀가구")
    if (
        re.search(r"(?:중소|중견|중소·중견)기업.{0,25}(?:재직|근로)", blob)
        or re.search(r"(?:재직|근로).{0,25}(?:중소|중견|중소·중견)기업", blob)
    ):
        _append_allowed(special, "특화대상", "중소·중견기업 재직자")
    if "차상위" in blob:
        _append_allowed(special, "특화대상", "차상위계층")
    if "기초생활수급" in blob:
        _append_allowed(special, "특화대상", "기초생활수급자")
    if re.search(r"한부모\s*(?:가정|가족)", blob):
        _append_allowed(special, "특화대상", "한부모가정")
    if "장애인" in blob or "장애학생" in blob:
        _append_allowed(special, "특화대상", "장애인")
    if re.search(r"농업인|농업경영", blob):
        _append_allowed(special, "특화대상", "농업인")
    if re.search(r"군인|장병|군\s*복무", blob):
        _append_allowed(special, "특화대상", "군인")
    if "지역인재" in blob:
        _append_allowed(special, "특화대상", "지역인재")
    if "신혼부부" in blob:
        _append_allowed(special, "특화대상", "신혼부부")
    if re.search(r"신생아|영유아", blob):
        _append_allowed(special, "특화대상", "신생아·영유아 가구")
    if "자립준비청년" in blob:
        _append_allowed(special, "특화대상", "자립준비청년")
    if re.search(r"주거취약계층|주거\s*취약", blob):
        _append_allowed(special, "특화대상", "주거취약계층")
    if re.search(r"전세사기\s*(?:피해자|피해)", blob):
        _append_allowed(special, "특화대상", "전세사기 피해자")

    return {
        "최종학력": _profile_result(
            "최종학력", education, blob,
            direct_values=[row.get("학력·재학조건")],
        ),
        "현재 상태": _profile_result(
            "현재 상태", status, blob,
            direct_values=[row.get("취업상태")],
        ),
        "관심 분야": "장학·금융",
        "현재 주거 형태": _profile_result("현재 주거 형태", housing, blob),
        "가구 구성": _profile_result("가구 구성", household, blob),
        "독립거주 여부": _profile_result("독립거주 여부", independent, blob),
        "혼인 상태": _profile_result("혼인 상태", marriage, blob),
        "주택 소유 여부": _profile_result("주택 소유 여부", ownership, blob),
        "세대주 여부": _profile_result("세대주 여부", headship, blob),
        "주거급여 수급 여부": _profile_result("주거급여 수급 여부", housing_benefit, blob),
        "특화대상": _profile_result(
            "특화대상", special, blob,
            direct_values=[row.get("특화대상_원문")],
        ),
        "조건근거URL": _profile_condition_source(policy_name, row) or EMPTY_UNKNOWN,
    }


def apply_profile_columns(row: dict[str, str]) -> None:
    """최종 CSV 저장 직전에 선택형 조건 컬럼을 새 스키마로 갱신한다."""
    for col in [*PROFILE_COLUMNS, "조건근거URL"]:
        row[col] = ""
    row.update(infer_profile_columns(row))


def verified_official_source_for(policy_name: str) -> str:
    n = norm_name(policy_name)
    for name, url in VERIFIED_OFFICIAL_SOURCE_OVERRIDES.items():
        if norm_name(name) == n:
            return url
    return ""


# 수동 검증 12개 정책은 API 별칭으로 발견되어도 같은 검증표를 사용한다.
CURATED_NAME_ALIASES: dict[str, str] = {
    norm_name("취업후상환학자금_등록금"): "취업 후 상환 학자금대출",
    norm_name("취업후상환학자금_생활비"): "취업 후 상환 학자금대출",
    norm_name("부산 지역인재 장학금 지원"): "부산지역인재 장학금",
    norm_name("부산지역인재 장학금 및 취업장려금"): "부산지역인재 장학금",
    norm_name("부산 대학생 학자금 대출이자 지원"): "부산광역시 대학(원)생 학자금대출 이자지원",
    norm_name("부산 학자금 대출이자 지원"): "부산광역시 대학(원)생 학자금대출 이자지원",
    norm_name("학자금 대출이자 지원"): "부산광역시 대학(원)생 학자금대출 이자지원",
    norm_name("부산 청년 자산형성 지원(부산청년 기쁨두배통장)"): "부산청년 기쁨두배통장",
}


def resolve_curated_key(policy_name: str, expected_scope: str | None = None) -> str | None:
    n = norm_name(policy_name)
    if not n:
        return None

    # 검증표 키 자체와 정확히 일치
    for key in CURATED_FALLBACKS:
        if norm_name(key) == n:
            return key

    # 실제 실행에서 관찰된 API/공식사이트 별칭
    alias_target = CURATED_NAME_ALIASES.get(n)
    if alias_target:
        # 일반명 '학자금 대출이자 지원'은 부산 범위에서만 부산 검증표에 연결한다.
        if n == norm_name("학자금 대출이자 지원") and expected_scope not in {None, "부산"}:
            return None
        return alias_target

    # supplemental seed의 별칭/검색어와 정확히 일치하되 지역범위까지 맞을 때만 연결
    for seed in SUPPLEMENTAL_POLICY_SEEDS:
        if expected_scope and seed.expected_scope and expected_scope != seed.expected_scope:
            continue
        names = [seed.name, *seed.aliases, *seed.api_queries]
        if any(norm_name(x) == n for x in names if clean_text(x)):
            return seed.name if seed.name in CURATED_FALLBACKS else None

    return None


def reapply_curated_age_fields(row: dict[str, str]) -> None:
    """
    중복 병합 뒤 다른 API 행의 '연령제한 없음'이 다시 들어오는 것을 막기 위해,
    수동 검증 정책의 연령 원문/정규화값을 마지막에 한 번 더 적용한다.
    """
    curated_key = resolve_curated_key(
        clean_text(row.get("정책명")),
        clean_text(row.get("신청범위")) or None,
    )
    if not curated_key:
        return
    fields = CURATED_FALLBACKS.get(curated_key, {}).get("fields", {})
    age_raw = clean_text(fields.get("연령조건_원문"))
    if not age_raw:
        return

    row["연령조건_원문"] = age_raw
    if any(k in age_raw for k in ["미표기", "별도 연령조건"]):
        row["최소연령"] = EMPTY_UNKNOWN
        row["최대연령"] = EMPTY_UNKNOWN
        return

    curated_min = clean_text(fields.get("최소연령"))
    curated_max = clean_text(fields.get("최대연령"))
    parsed_min, parsed_max, _ = extract_age(age_raw)
    row["최소연령"] = curated_min or parsed_min or EMPTY_UNKNOWN
    row["최대연령"] = curated_max or parsed_max or EMPTY_UNKNOWN


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


# URL/기관명 정규화 -----------------------------------------------------------
DOMAIN_LIKE_RE = re.compile(
    r"^(?:www\.)?[a-z0-9.-]+\.[a-z]{2,}(?::\d+)?(?:/[^\s]*)?$",
    re.I,
)
NON_APPLICATION_HOST_TOKENS = {
    "youtube.com", "www.youtube.com", "youtu.be",
    "instagram.com", "www.instagram.com", "facebook.com", "www.facebook.com",
    "blog.naver.com", "cafe.naver.com",
}


def normalize_web_url(value: Any) -> str:
    """실제 웹 URL만 반환한다. scheme 없는 도메인은 https://를 보완한다."""
    s = clean_text(value)
    if not s or s in {EMPTY_UNKNOWN, NO_LIMIT}:
        return ""
    # URL 칸에 설명문이 들어간 경우 URL로 취급하지 않는다.
    if any(tok in s for tok in [
        "온라인 신청 없음", "앱·웹", "앱/웹", "홈페이지에서 신청", "방문접수", "방문 접수",
    ]):
        return ""
    s = s.strip().strip("<>[](){}\"'")
    if s.startswith("//"):
        s = "https:" + s
    elif DOMAIN_LIKE_RE.fullmatch(s):
        s = "https://" + s
    elif not re.match(r"^https?://", s, re.I):
        return ""
    try:
        p = urlparse(s)
    except Exception:
        return ""
    if p.scheme.lower() not in {"http", "https"} or not p.netloc:
        return ""
    return s


NON_APPLICATION_PATH_TOKENS = {
    "filedown", "download", "/qna", "/faq", "myapplycheck",
    "customerdeclarecenter", "customerdeclare", "complaint", "reportcenter",
    "personalinfohist",
}

NON_SOURCE_PATH_TOKENS = {
    "myapplycheck", "/mypage", "/qna", "/faq", "oftendonequestion",
    "customerdeclarecenter", "customerdeclare",
}


def normalize_apply_url(value: Any) -> str:
    """
    신청URL에는 실제 신청 경로로 볼 수 있는 웹주소만 남긴다.

    첨부파일 다운로드, Q&A/FAQ, 신청내역 확인, 고객신고센터처럼
    '신청'과 무관한 페이지는 URL 형식이 정상이어도 신청URL로 쓰지 않는다.
    """
    u = normalize_web_url(value)
    if not u:
        return ""
    parsed = urlparse(u)
    host = parsed.netloc.lower().split(":")[0]
    if host in NON_APPLICATION_HOST_TOKENS:
        return ""

    route = f"{parsed.path}?{parsed.query}".lower()
    if any(tok in route for tok in NON_APPLICATION_PATH_TOKENS):
        return ""

    # 공식 사이트라도 '사업/상품 설명·공지' 페이지 자체는 신청URL로 쓰지 않는다.
    # 실제 신청 버튼의 고정 목적지를 확인하지 못했다면 확인필요로 남긴다.
    if host in {"www.kosaf.go.kr", "kosaf.go.kr"}:
        if parsed.path.lower() in {"/", "/ko/main.do"}:
            return ""
        if parsed.path.lower() in {"/ko/scholar.do", "/ko/tuition.do", "/ko/notice.do"}:
            return ""
    if host == "young.busan.go.kr" and parsed.path.lower() == "/index.nm":
        from urllib.parse import parse_qs
        q = parse_qs(parsed.query)
        q_keys = {str(k).lower() for k in q}
        if q_keys and q_keys <= {"menucd"}:
            return ""
    if host in {"nhuf.molit.go.kr", "www.nhuf.molit.go.kr"} and parsed.path.lower().startswith("/fp/"):
        return ""
    if host == "friend.saha.go.kr" and parsed.path.lower().endswith("/contents.do"):
        return ""
    if host in {"www.kcce.or.kr", "kcce.or.kr"} and "/majorbusiness/" in parsed.path.lower():
        return ""
    if host in {"www.kinfa.or.kr", "kinfa.or.kr"} and "/financialproduct/" in parsed.path.lower():
        return ""

    # 첨부파일 식별 파라미터도 신청페이지가 아니라 다운로드 링크로 본다.
    if any(tok in route for tok in ["atchfileid=", "filesn=", "file_seq=", "fileid="]):
        return ""
    return u


def normalize_source_url(value: Any) -> str:
    """원문URL은 정책 상세·공고 페이지 성격의 공식 URL만 허용한다."""
    u = normalize_web_url(value)
    if not u:
        return ""
    parsed = urlparse(u)
    route = f"{parsed.path}?{parsed.query}".lower()
    if any(tok in route for tok in NON_SOURCE_PATH_TOKENS):
        return ""
    return u


def first_valid_source_url(*values: Any) -> str:
    """refUrlAddr1이 부적합하면 refUrlAddr2까지 순서대로 확인한다."""
    for value in values:
        u = normalize_source_url(value)
        if u and is_official_url(u):
            return u
    return ""


def first_valid_apply_url(*values: Any) -> str:
    """여러 신청 URL 후보 중 실제 신청 경로로 볼 수 있는 첫 URL을 반환한다."""
    for value in values:
        u = normalize_apply_url(value)
        if u:
            return u
    return ""


AGENCY_NOISE_TOKENS = [
    "지원절차", "온라인 신청", "온라인신청", "신청하기", "바로가기", "상세보기",
    "지원내용", "지원대상", "사업내용", "공지사항", "메뉴", "홈페이지",
]


def clean_agency_name(value: Any) -> str:
    """기관명에 붙은 메뉴/내비게이션 잡음을 제거하되 실제 복수 기관명은 보존한다."""
    s = clean_text(value)
    if not s or s in {EMPTY_UNKNOWN, NO_LIMIT}:
        return ""
    s = re.sub(r"^(?:시행기관|주관기관|주최기관|추진기관|운영기관|수행기관|담당기관)\s*[:：-]\s*", "", s)
    parts = [clean_text(x) for x in re.split(r"\s*(?:\||/|▶|>)\s*", s) if clean_text(x)]
    kept: list[str] = []
    for part in parts:
        if any(tok in part for tok in AGENCY_NOISE_TOKENS):
            continue
        if re.match(r"^https?://", part, re.I):
            continue
        # 기관명 칸에 설명문 전체가 들어간 경우 보수적으로 버린다.
        if len(part) > 80 and not re.search(r"(부|청|공사|공단|재단|진흥원|센터|위원회|협회|은행|기금|장학회|광역시|구청)$", part):
            continue
        if part not in kept:
            kept.append(part)
    return " / ".join(kept[:3])


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
    if normalize_always_flag(always) == "Y":
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
    row = {c: EMPTY_UNKNOWN for c in ROW_COLUMNS}
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
        if "전국" in blob or "대한민국" in blob or "전 국민" in blob:
            return 1, "전국 대상 문구 확인"
        if codes:
            code_set = set(codes)
            prefixes = {c[:2] for c in codes if c != "00000"}
            if "00000" in code_set or len(prefixes) >= 3:
                return 1, f"다수 시도/전국 zipCd 확인: {summarize_zip_codes(zip_raw)}"
            if len(prefixes) == 1:
                return -1, f"특정 시도 내부 zipCd만 명시됨: {summarize_zip_codes(zip_raw)}"
            if len(prefixes) == 2:
                return -1, f"일부 시도 복합범위로 전국 아님: {summarize_zip_codes(zip_raw)}"
        if other_regions or has_busan:
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
        self.discovery_exclusions: list[dict[str, Any]] = []

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
        self.discovery_exclusions = []

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
            exclusion_reason = policy_exclusion_reason(cand)
            if exclusion_reason:
                self.discovery_exclusions.append({
                    "seed": clean_text(cand.get("plcyNm")),
                    "api_query_used": ", ".join(sorted(matched_terms.get(key, set()))),
                    "api_match_score": -1.0,
                    "api_plcyNo": clean_text(cand.get("plcyNo")),
                    "api_plcyNm": clean_text(cand.get("plcyNm")),
                    "api_match_note": "내용검증 제외",
                    "crawl_urls": [], "curated_fields": [], "errors": [], "method": ["API"],
                    "excluded": True, "exclude_reason": exclusion_reason,
                })
                continue
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

            exclusion_reason = policy_exclusion_reason(detailed)
            if exclusion_reason:
                self.discovery_exclusions.append({
                    "seed": clean_text(detailed.get("plcyNm")),
                    "api_query_used": ", ".join(sorted(matched_terms.get(key, set()))),
                    "api_match_score": -1.0,
                    "api_plcyNo": clean_text(detailed.get("plcyNo")),
                    "api_plcyNm": clean_text(detailed.get("plcyNm")),
                    "api_match_note": "상세 내용검증 제외",
                    "crawl_urls": [], "curated_fields": [], "errors": [], "method": ["API"],
                    "excluded": True, "exclude_reason": exclusion_reason,
                })
                continue
            if not is_finance_scholarship_candidate(detailed):
                continue

            scope, _, _, region_reason = classify_api_target_region(detailed)
            if scope not in TARGET_SCOPES:
                self.discovery_exclusions.append({
                    "seed": clean_text(detailed.get("plcyNm")),
                    "api_query_used": ", ".join(sorted(matched_terms.get(key, set()))),
                    "api_match_score": -1.0,
                    "api_plcyNo": clean_text(detailed.get("plcyNo")),
                    "api_plcyNm": clean_text(detailed.get("plcyNm")),
                    "api_match_note": region_reason,
                    "crawl_urls": [], "curated_fields": [], "errors": [], "method": ["API"],
                    "excluded": True, "exclude_reason": "수집 대상 지역 아님/지역 근거 부족",
                })
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
    "대출대상", "대출 대상",
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
    """
    연령 표현을 보수적으로 파싱한다.

    지원 예:
    - 만 18세~39세
    - 만18~34세
    - 18~39세
    - 만 19세 이상 만 39세 이하
    - 만 55세 이하
    - 학부 만 35세 / 대학원 만 40세
    """
    s = clean_text(text)
    if not s:
        return "", "", ""

    # 1) '만 19세 이상 만 39세 이하' 형태를 우선 처리
    m = re.search(
        r"만?\s*(\d{1,2})\s*세?\s*이상.{0,30}?만?\s*(\d{1,2})\s*세?\s*이하",
        s,
    )
    if m:
        return m.group(1), m.group(2), clean_text(m.group(0))

    # 2) 범위형. 첫 숫자 뒤 '세'가 생략된 '만18~34세'도 허용한다.
    range_patterns = [
        r"만\s*(\d{1,2})\s*(?:세)?\s*(?:이상|부터)?\s*[~～\-–—]\s*만?\s*(\d{1,2})\s*세",
        r"(?<!\d)(\d{1,2})\s*(?:세)?\s*(?:이상|부터)?\s*[~～\-–—]\s*(\d{1,2})\s*세",
    ]
    for p in range_patterns:
        m = re.search(p, s)
        if m:
            return m.group(1), m.group(2), clean_text(m.group(0))

    # 3) 단일 최소/최대 조건. 여러 '이하'가 있으면 가장 넓은 상한을 보존한다.
    min_vals = [int(x) for x in re.findall(r"만?\s*(\d{1,2})\s*세?\s*이상", s)]
    max_vals = [int(x) for x in re.findall(r"만?\s*(\d{1,2})\s*세?\s*(?:이하|미만)", s)]
    min_vals = [x for x in min_vals if 0 < x < 100]
    max_vals = [x for x in max_vals if 0 < x < 100]
    if min_vals or max_vals:
        lo = min(min_vals) if min_vals else None
        hi = max(max_vals) if max_vals else None
        raw_parts = []
        if lo is not None:
            raw_parts.append(f"만 {lo}세 이상")
        if hi is not None:
            raw_parts.append(f"만 {hi}세 이하")
        return str(lo) if lo is not None else "", str(hi) if hi is not None else "", " / ".join(raw_parts)

    # 4) '학부 만35세 / 대학원 만40세'처럼 집단별 상한만 나열된 형태.
    if any(label in s for label in ["학부", "대학원", "대학생", "대학원생"]):
        vals = [int(x) for x in re.findall(r"만\s*(\d{1,2})\s*세", s)]
        vals = [x for x in vals if 0 < x < 100]
        if vals:
            return "", str(max(vals)), s

    return "", "", ""


def extract_explicit_youth_age(text: str) -> tuple[str, str, str]:
    """
    '청년'과 같은 문맥에 실제 연령표현이 같이 있는 경우만 추출한다.
    전체 지원내용의 다른 하위조건(예: 만25세 미만 단독세대주)을
    정책 전체 연령조건으로 오인하지 않기 위한 보수적 보완 파서.
    """
    t = clean_text(text)
    if not t:
        return "", "", ""

    chunks = [
        clean_text(x)
        for x in re.split(r"[\n。]|(?<=[.!?])\s+|\s*/\s*", t)
        if clean_text(x)
    ]
    for chunk in chunks:
        if "청년" not in chunk:
            continue
        lo, hi, raw = extract_age(chunk)
        if lo or hi:
            return lo, hi, raw
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
        code_set = set(codes)
        prefixes = {c[:2] for c in codes if c != "00000"}
        if "00000" in code_set:
            return "전국", "전국", ""
        if prefixes == {"26"}:
            if code_set == {"26230"}:
                return REGION_CODE_MAP["26230"]
            if code_set == {"26380"}:
                return REGION_CODE_MAP["26380"]
            # 부산 16개 구·군처럼 코드가 많아도 부산광역시 범위다.
            return "부산", "부산광역시", ""
        # 전국 판정은 '코드 개수'가 아니라 실제 여러 시·도 prefix가 확인될 때만 한다.
        if len(prefixes) >= 3:
            return "전국", "전국", ""

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

    # 정규화 칸이 비어 있어도 공식 원문에서 파싱 가능한 경우에는 그 값으로 판정한다.
    if raw and (min_age is None or max_age is None):
        parsed_min, parsed_max, _ = extract_age(raw)
        if min_age is None:
            min_age = _as_age_number(parsed_min)
        if max_age is None:
            max_age = _as_age_number(parsed_max)

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

    # 제목/운영기관/시행기관/공식 URL에 다른 시·도가 명시되면
    # zipCd가 전국 코드처럼 넓게 들어 있어도 지역사업으로 보고 제외한다.
    # 일부 API 레코드는 실제 지역사업인데도 zipCd를 전국 전체 코드로 내려주는 사례가 있다.
    strong_region_blob = as_joined([title, institution_blob, *urls], sep=" | ").lower()
    for region, kws in OTHER_REGION_KEYWORDS.items():
        if any(k.lower() in strong_region_blob for k in kws):
            return "", "", "", f"타지역 강한 근거={region}"

    # ------------------------------------------------------------------
    # 1) zipCd가 있으면 우선 판정
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


EDUCATION_ONLY_TOKENS = [
    "금융교육", "금융 교육", "금융강좌", "금융 강좌", "금융스쿨",
    "토크콘서트", "재무설계 온라인", "교육봉사단",
]
PLANNING_RESEARCH_TOKENS = [
    "연구용역", "정책 연구", "방안 연구", "연계방안 검토", "연계 방안 검토",
    "연계 강화 방안", "사업 연계방안", "타당성 조사", "정책 연계 강화",
]
EXPLICIT_BUSINESS_ONLY_TOKENS = [
    "사업주 지원", "사업주지원", "사용자 지원",
]


def _candidate_title_body(cand: dict[str, Any] | dict[str, str]) -> tuple[str, str, str]:
    title = clean_text(cand.get("plcyNm") or cand.get("정책명"))
    target = as_joined([
        cand.get("addAplyQlfcCndCn"), cand.get("지원대상_원문"), cand.get("대상유형")
    ], sep=" ")
    body = as_joined([
        cand.get("plcyExplnCn"), cand.get("plcySprtCn"), cand.get("지원내용"),
        cand.get("요약"), cand.get("제외대상"), target,
    ], sep=" ")
    return title, target, body


def has_direct_person_benefit(text: str) -> bool:
    """기업 지원과 청년 개인 지급이 섞인 사업에서 개인 혜택이 실제 있는지 확인한다."""
    t = clean_text(text)
    if not t:
        return False
    patterns = [
        r"(?:청년|근로자|학생|대학생|대학원생|개인|본인).{0,45}?(?:에게|대상).{0,35}?(?:지급|지원|장학금|대출|융자|이자|기여금|인센티브)",
        r"(?:청년|근로자|학생|대학생|대학원생).{0,30}?(?:최대\s*)?[\d,]+\s*만?\s*원.{0,20}?(?:지급|지원)",
        r"(?:본인|개인).{0,25}?(?:부담|이자|보증료).{0,25}?(?:감면|지원)",
        r"1인당\s*(?:최대\s*)?[\d,]+\s*만?\s*원.{0,20}?(?:지급|지원)",
        r"(?:지급|지원).{0,25}?1인당\s*(?:최대\s*)?[\d,]+\s*만?\s*원",
    ]
    return any(re.search(p, t) for p in patterns)


def policy_exclusion_reason(cand: dict[str, Any] | dict[str, str]) -> str:
    """장학·금융 검색어에 걸렸지만 실제 직접 혜택 정책이 아닌 경우 제외 사유를 반환한다."""
    title, target, body = _candidate_title_body(cand)
    all_text = as_joined([title, body], sep=" ")

    if any(tok in title for tok in EDUCATION_ONLY_TOKENS):
        return "금융교육/강좌 등 비금전성 콘텐츠"

    # 연구·검토·연계방안 자체가 정책인 경우. '이공계 연구생활장려금'처럼
    # 연구자가 직접 금전 지원을 받는 정책은 이 규칙에 걸리지 않는다.
    if any(tok in all_text for tok in PLANNING_RESEARCH_TOKENS):
        if not has_direct_person_benefit(body):
            return "연구·검토·연계방안 성격으로 직접 신청 가능한 혜택 아님"

    if any(tok in title for tok in EXPLICIT_BUSINESS_ONLY_TOKENS):
        # 제목 자체가 '사업주 지원'으로 명시된 경우에는 혼합 문구가 있어도 제외한다.
        return "사업주 전용 지원"

    # 청년 '기업' 자체에 대한 보증/융자만 제공하는 정책은 개인 혜택 데이터에서 제외한다.
    business_finance_title = re.search(
        r"(?:청년|유망청년)?\s*(?:창업)?기업.{0,12}(?:보증|융자|대출)", title
    )
    if business_finance_title and not has_direct_person_benefit(body):
        return "기업·창업기업 전용 금융지원"

    # 지원대상 원문이 기업/사업주만을 가리키고 개인 지급 근거가 없는 경우도 제외한다.
    if target and re.search(r"(?:지원대상|대상)?\s*(?:기업|사업주|사업장)", target):
        person_words = ["청년", "학생", "대학생", "대학원생", "근로자", "개인", "본인"]
        if not any(w in target for w in person_words) and not has_direct_person_benefit(body):
            return "기업·사업주만 지원대상"

    return ""


def is_finance_scholarship_candidate(cand: dict[str, Any]) -> bool:
    title = clean_text(cand.get("plcyNm"))
    category = as_joined([
        cand.get("lclsfNm"), cand.get("mclsfNm"), cand.get("plcyKywdNm")
    ], sep=" ")
    body = as_joined([
        cand.get("plcyExplnCn"), cand.get("plcySprtCn"), cand.get("addAplyQlfcCndCn")
    ], sep=" ")

    # 검색어에 걸렸더라도 교육·연구검토·사업주/기업 전용이면 먼저 제외한다.
    if policy_exclusion_reason(cand):
        return False

    monetary_evidence = [
        "장학", "학자금", "등록금", "대출", "융자", "이자지원", "이자 지원",
        "저축", "적금", "통장", "자산형성", "정부기여", "신용회복", "채무",
        "보증", "보증료", "장려금", "지원금", "생활비", "학업보조",
    ]
    # 제목 자체가 금융교육/강좌/재무설계 영상 등 교육 콘텐츠라면 제외한다.
    # 본문에 '학자금', '주택자금' 같은 단어가 교육 주제로 등장해도 금전 혜택 정책은 아니다.
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


def normalize_always_flag(value: Any) -> str:
    """상시모집은 Y/N을 기본으로 하되 검증된 sentinel 값은 보존한다."""
    raw = clean_text(value)
    if raw in CONDITION_SENTINELS:
        return raw
    t = raw.upper()
    if t in {"Y", "YES", "예", "TRUE", "1"}:
        return "Y"
    if t in {"N", "NO", "아니오", "아니요", "FALSE", "0"}:
        return "N"
    return ""


def normalize_numeric_condition(value: Any) -> str:
    """숫자 정규화 칸은 숫자 또는 세 sentinel 값만 허용한다."""
    t = clean_text(value)
    if t in CONDITION_SENTINELS:
        return t
    if re.fullmatch(r"\d+", t):
        return str(int(t))
    return EMPTY_UNKNOWN


def normalize_output_date(value: Any) -> str:
    """날짜 칸은 YYYY-MM-DD 또는 세 sentinel 값만 허용한다."""
    t = clean_text(value)
    if not t or t in {"상시", "연중", "수시"}:
        return EMPTY_UNKNOWN
    if t in CONDITION_SENTINELS:
        return t
    return normalize_date_string(t) or EMPTY_UNKNOWN


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
    return "|".join(found) if found else (hint or EMPTY_UNKNOWN)


def infer_employment(text: str) -> str:
    """
    취업상태는 확정된 허용값만 반환한다.
    허용값: 재직 / 미취업 / 창업 / 제한없음
    복수 해당 시 | 로 연결한다.
    """
    t = clean_text(text)
    if not t:
        return ""

    if re.search(r"(?:취업|재직|근로)\s*(?:여부|상태)?.{0,12}(?:무관|제한\s*없|관계\s*없)", t):
        return NO_LIMIT

    tags: list[str] = []
    if re.search(r"미취업|취업준비|구직", t):
        tags.append("미취업")
    if re.search(r"재직|근로\s*중|근로자|직장인|기취업|일용근로", t):
        tags.append("재직")
    if re.search(r"창업|자영업|소상공인|사업자", t):
        tags.append("창업")
    return "|".join(dict.fromkeys(tags))


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
    return "|".join([k for k in keys if k in t])



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
        href = normalize_apply_url(href)
        if not href:
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


POSTED_DATE_LABELS = ["등록일", "게시일", "작성일", "공고일자", "공고일", "게재일"]


def extract_posted_date(text: str) -> str:
    """
    게시 메타데이터 라벨에 바로 붙은 YYYY 날짜만 게시일로 인정한다.

    예전 구현은 '신청자격: 공고일(26.8.3.) 현재 ... 2008.12.31 출생'처럼
    본문에 등장한 '공고일'을 메타데이터로 오인해 뒤의 출생일(2008-12-31)을
    게시일로 집는 문제가 있었다. 따라서 라벨 직후의 4자리 연도 날짜만 허용한다.
    """
    lines = text_lines(text)
    label_alt = "|".join(re.escape(x) for x in POSTED_DATE_LABELS)
    inline_re = re.compile(
        rf"(?:^|[|｜\[\]])\s*(?:{label_alt})\s*[:：-]?\s*"
        rf"((?:20\d{{2}})[-./년\s]+\d{{1,2}}[-./월\s]+\d{{1,2}})",
        re.I,
    )
    label_only_re = re.compile(rf"^\s*(?:{label_alt})\s*[:：-]?\s*$", re.I)

    for i, line in enumerate(lines):
        m = inline_re.search(line)
        if m:
            d = normalize_date_string(m.group(1))
            if d:
                return d

        # '공고일자'와 날짜가 HTML 표에서 서로 다른 줄로 분리된 경우만 다음 줄을 본다.
        # 본문 중간의 '공고일 기준' 같은 문구는 이 조건을 통과하지 못한다.
        if label_only_re.fullmatch(line) and i + 1 < len(lines):
            next_line = lines[i + 1]
            m2 = re.match(
                r"^\s*((?:20\d{2})[-./년\s]+\d{1,2}[-./월\s]+\d{1,2})",
                next_line,
            )
            if m2:
                d = normalize_date_string(m2.group(1))
                if d:
                    return d
    return ""


KOSAF_NAV_NOISE = [
    "신용카드사회공헌재단", "WEST 재정지원금", "재단소개", "고객센터",
    "로그인", "통합검색", "학자금뱅킹", "채무자신고", "전자민원",
]


KOSAF_MENU_CLUSTER_TOKENS = [
    "장학금 한눈에 보기", "국가장학금 알리미", "한눈에 보는 학자금 지원구간",
    "신청현황", "온라인 사전교육", "수혜내역", "증서발급", "선정결과",
    "근로기관 참여제한 관리", "희망근로지 신청", "장학금환수", "의무종사관리",
]

# 한국장학재단 상세페이지에서 본문과 함께 붙는 뉴스/타 장학사업 메뉴를 지원대상으로 오인하지 않기 위한 잡음 토큰.
KOSAF_ARTICLE_NAV_NOISE = [
    "공지사항", "보도자료", "재단소식", "뉴스", "고객센터", "자주묻는질문",
    "FAQ", "사업소개", "전체메뉴", "관련사이트", "바로가기",
]

KOSAF_OTHER_SCHOLARSHIP_TOKENS = [
    "희망사다리", "국가근로장학금", "다자녀 국가장학금", "주거안정장학금",
    "전문기술인재", "인문100년", "예술체육비전", "대통령과학장학금",
]

SCIENCE_SCHOLARSHIP_TARGET_TOKENS = [
    "이공계", "자연과학", "공학계열", "4년제 대학", "신입생", "3학년",
    "대한민국 국적", "성적우수", "재학",
]

BUSAN_YOUTH_MENU_CLUSTER_TOKENS = [
    "부산청년 기쁨두배통장", "청년내일저축계좌", "대학생 기숙사비 지원",
    "청년 신용회복지원사업", "청년 마음이음", "청년사회서비스사업단",
    "청년돌봄이음", "부산지역인재 장학금", "취업장려금",
]


def looks_like_navigation_cluster(value: Any, tokens: list[str], *, threshold: int = 2) -> bool:
    """메뉴 항목 여러 개가 한 필드에 연속으로 들어간 경우를 보수적으로 탐지한다."""
    t = clean_text(value)
    if not t:
        return False
    hits = sum(1 for token in tokens if token in t)
    return hits >= threshold


def clean_kosaf_menu_pollution(parsed: dict[str, str]) -> dict[str, str]:
    """한국장학재단 전체메뉴가 지원대상/제외대상 등으로 오인된 값을 제거한다."""
    out = dict(parsed)
    for field in [
        "지원대상_원문", "지원내용", "학력·재학조건", "소득조건",
        "제외대상", "신청방법",
    ]:
        value = clean_text(out.get(field))
        if not value:
            continue
        if looks_like_navigation_cluster(value, KOSAF_MENU_CLUSTER_TOKENS, threshold=2):
            out[field] = ""
            if field == "지원내용":
                out["지원금액"] = ""
            continue
        if field == "소득조건" and value in {
            "한눈에 보는 학자금 지원구간", "학자금 지원구간", "소득연계형 국가장학금"
        }:
            out[field] = ""
    return out


def clean_kosaf_policy_specific_pollution(
    parsed: dict[str, str],
    seed: PolicySeed,
) -> dict[str, str]:
    """
    KOSAF 페이지의 뉴스/타 장학사업 메뉴가 특정 정책의 지원대상으로 섞이는 것을 제거한다.

    특히 국가우수장학금(이공계) 페이지에서 다른 장학사업 링크·뉴스 묶음이
    '지원대상_원문'으로 들어온 실제 오탐을 회귀 방지한다.
    """
    out = dict(parsed)
    if norm_name(seed.name) != norm_name("이공계 우수학생 국가장학금"):
        return out

    for field in ["지원대상_원문", "학력·재학조건", "제외대상"]:
        value = clean_text(out.get(field))
        if not value:
            continue
        chunks = [clean_text(x) for x in re.split(r"\s*/\s*|\n+", value) if clean_text(x)]
        kept: list[str] = []
        for chunk in chunks:
            # 다른 장학사업명이 들어간 메뉴/뉴스 조각은 버린다.
            if any(tok in chunk for tok in KOSAF_OTHER_SCHOLARSHIP_TOKENS):
                continue
            # 뉴스/메뉴 표식이 있으면서 이공계 지원자격 문맥이 없으면 버린다.
            if any(tok in chunk for tok in KOSAF_ARTICLE_NAV_NOISE) and not any(
                tok in chunk for tok in SCIENCE_SCHOLARSHIP_TARGET_TOKENS
            ):
                continue
            # 기존 전체메뉴 클러스터도 조각 단위로 제거한다.
            if looks_like_navigation_cluster(chunk, KOSAF_MENU_CLUSTER_TOKENS, threshold=2):
                continue
            kept.append(chunk)
        out[field] = as_joined(kept, sep=" / ")

    return out


def clean_busan_youth_menu_pollution(parsed: dict[str, str]) -> dict[str, str]:
    """부산청년플랫폼 좌측/상단 메뉴 묶음이 정책 필드로 들어간 경우 제거한다."""
    out = dict(parsed)
    for field in ["지원대상_원문", "학력·재학조건", "제외대상"]:
        if looks_like_navigation_cluster(
            out.get(field), BUSAN_YOUTH_MENU_CLUSTER_TOKENS, threshold=3
        ):
            out[field] = ""
    return out


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
         "대출대상", "대출 대상",
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
        "Y" if any(k in app_period for k in ["상시", "연중", "수시"])
        else ("N" if app_start or app_end else "")
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
        "특화대상_원문": infer_special_target(target),
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

    for field in ["지원대상_원문", "지원내용", "학력·재학조건", "소득조건", "제외대상", "신청방법"]:
        base[field] = filter_noise_chunks(base.get(field, ""), KOSAF_NAV_NOISE)

    base = clean_kosaf_menu_pollution(base)
    base = clean_kosaf_policy_specific_pollution(base, seed)

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
        base = clean_kosaf_policy_specific_pollution(base, seed)

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

    parsed = parse_crawl_generic(doc)
    if host == "young.busan.go.kr":
        parsed = clean_busan_youth_menu_pollution(parsed)

    # NHUF 페이지에서 지급방법의 '거주여부 확인'이 거주자격으로 잘못 들어가는 것을 차단.
    if "nhuf.molit.go.kr" in host:
        target = clean_text(parsed.get("지원대상_원문"))
        residency = clean_text(parsed.get("거주조건_원문"))
        if "대출금 지급" in target or ("임대인" in target and "대출실행" in target):
            parsed["지원대상_원문"] = ""
        if "대출실행 후" in residency and "거주여부" in residency:
            parsed["거주조건_원문"] = ""

    return parsed


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
def normalize_income_condition(value: Any) -> str:
    """
    소득조건 원문을 보수적으로 정규화한다.

    '해당없음'을 빈 값이라는 이유로 임의 생성하지 않는다.
    다만 API 원문이 '(청년)해당없음'처럼 청년의 소득조건 부재를
    명시한 경우에만 그 부분을 '(청년)소득조건 제한없음'으로 바꾼다.
    기업 기준 등 다른 조건은 그대로 보존한다.
    """
    s = clean_text(value)
    if not s:
        return ""
    s = re.sub(
        r"\(\s*청년\s*\)\s*해당\s*없음",
        "(청년)소득조건 제한없음",
        s,
    )
    return s


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
    earn_etc = normalize_income_condition(api.get("earnEtcCn"))
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
        "Y" if any(k in app_raw for k in ["상시", "연중", "수시"])
        else ("N" if app_start or app_end else "")
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
        "운영기관": clean_agency_name(api.get("operInstCdNm")),
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
        "특화대상_원문": special,
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
        "신청URL": first_valid_apply_url(api.get("aplyUrlAddr")),
        "원문URL": first_valid_source_url(api.get("refUrlAddr1"), api.get("refUrlAddr2")),
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
    - '해당없음'은 공식 원문/검증값에서 비해당이 명확할 때만 보존·사용한다.
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

        # API가 '연령제한 없음'으로 일반화했더라도 공식 원문에 실제 연령이
        # 명시되어 있으면 공식 원문을 우선한다.
        if k in {"연령조건_원문", "최소연령", "최대연령"}:
            parsed_has_age = bool(
                clean_text(parsed.get("최소연령"))
                or clean_text(parsed.get("최대연령"))
                or extract_age(clean_text(parsed.get("연령조건_원문")))[:2] != ("", "")
            )
            current_is_generic = (
                row.get("최소연령") in {"", EMPTY_UNKNOWN, NO_LIMIT}
                or row.get("최대연령") in {"", EMPTY_UNKNOWN, NO_LIMIT}
                or clean_text(row.get("연령조건_원문")) in {"", EMPTY_UNKNOWN, "연령제한 없음", "연령 제한 없음"}
            )
            if parsed_has_age and current_is_generic:
                row[k] = v
                continue

        if prefer_dynamic and k in OFFICIAL_DYNAMIC_FIELDS:
            row[k] = v



def apply_verified_policy_field_overrides(row: dict[str, str]) -> None:
    """
    현재 공식 출처로 직접 확인한 정책별 보정값을 마지막 단계에서 적용한다.

    일반 규칙으로 추정하지 않고 VERIFIED_POLICY_FIELD_OVERRIDES에 등록된 정책만 처리한다.
    중복 병합 후 오래된 API 행의 값이 다시 들어오는 경우도 막기 위해 dedupe 이후에도 재호출한다.
    """
    n = norm_name(clean_text(row.get("정책명")))
    fields: dict[str, str] | None = None
    for policy_name, values in VERIFIED_POLICY_FIELD_OVERRIDES.items():
        if norm_name(policy_name) == n:
            fields = values
            break
    if not fields:
        return

    changed: list[str] = []
    for key, value in fields.items():
        if key not in row:
            continue
        value = clean_text(value)
        if clean_text(row.get(key)) != value:
            row[key] = value
            changed.append(key)

    # URL은 override 적용 후에도 동일한 정규화 규칙을 거친다.
    if "신청URL" in fields:
        if row.get("신청URL") != EMPTY_UNKNOWN:
            row["신청URL"] = normalize_apply_url(row.get("신청URL")) or EMPTY_UNKNOWN
    if "원문URL" in fields:
        if row.get("원문URL") != EMPTY_UNKNOWN:
            source = normalize_source_url(row.get("원문URL"))
            row["원문URL"] = source if source and is_official_url(source) else EMPTY_UNKNOWN

    explicit_youth = clean_text(fields.get("청년대상구분"))
    if explicit_youth in {"청년전용", "청년포함", "연령조건미표기"}:
        row["청년대상구분"] = explicit_youth
    else:
        row["청년대상구분"] = classify_youth_target(row)

    # 날짜를 보정한 정책은 실행시점 기준 진행상태도 다시 계산한다.
    if any(k in fields for k in ["신청시작일", "신청마감일", "상시모집"]):
        row["진행상태"] = calc_status(
            "" if row.get("신청시작일") in {"", EMPTY_UNKNOWN} else clean_text(row.get("신청시작일")),
            "" if row.get("신청마감일") in {"", EMPTY_UNKNOWN} else clean_text(row.get("신청마감일")),
            clean_text(row.get("상시모집")),
        )

    if changed:
        source_note = clean_text(VERIFIED_POLICY_OVERRIDE_SOURCES.get(clean_text(row.get("정책명"))))
        row["비고"] = as_joined([
            row.get("비고"),
            f"공식출처 검증값 보정필드={', '.join(changed)}",
            f"공식검증근거={source_note}" if source_note else "",
        ])
        methods = [
            x for x in clean_text(row.get("수집방식")).split("+")
            if x and x != EMPTY_UNKNOWN
        ]
        if "공식검증보정" not in methods:
            methods.append("공식검증보정")
        row["수집방식"] = "+".join(methods) if methods else "공식검증보정"


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

    # 병합 이후 파생값을 한 번 더 보완한다.
    # 지원내용에 명시적 금액이 있는데 지원금액만 비어 있으면 그 금액만 추출한다.
    if row.get("지원금액") in {"", EMPTY_UNKNOWN}:
        amount = extract_money(clean_text(row.get("지원내용")))
        if amount:
            row["지원금액"] = amount

    # 수동 검증 12개 정책은 검증된 연령 원문을 그대로 사용한다.
    # 그 외 정책은 '청년'과 같은 문맥에 명시적 연령이 있을 때만
    # API의 '연령제한 없음/확인필요'을 보완한다.
    curated_key = resolve_curated_key(seed.name, seed.expected_scope)
    has_curated_age = bool(
        curated_key
        and clean_text(CURATED_FALLBACKS.get(curated_key, {}).get("fields", {}).get("연령조건_원문"))
    )
    current_age_raw = clean_text(row.get("연령조건_원문"))
    if not has_curated_age and (
        current_age_raw in {"", EMPTY_UNKNOWN, "연령제한 없음", "연령 제한 없음"}
        or row.get("최소연령") in {"", EMPTY_UNKNOWN, NO_LIMIT}
        or row.get("최대연령") in {"", EMPTY_UNKNOWN, NO_LIMIT}
    ):
        youth_age_text = as_joined([
            row.get("지원대상_원문"),
            row.get("지원내용"),
            row.get("요약"),
        ], sep=" / ")
        age_min, age_max, age_raw = extract_explicit_youth_age(youth_age_text)
        if age_min or age_max:
            row["연령조건_원문"] = age_raw or current_age_raw
            row["최소연령"] = age_min or EMPTY_UNKNOWN
            row["최대연령"] = age_max or EMPTY_UNKNOWN

    # 기관명과 URL은 마지막 병합 이후 한 번 더 정제한다.
    row["시행기관"] = clean_agency_name(row.get("시행기관")) or EMPTY_UNKNOWN
    row["운영기관"] = clean_agency_name(row.get("운영기관")) or EMPTY_UNKNOWN
    row["소득조건"] = normalize_income_condition(row.get("소득조건")) or EMPTY_UNKNOWN
    row["신청URL"] = normalize_apply_url(row.get("신청URL")) or EMPTY_UNKNOWN
    normalized_source = normalize_source_url(row.get("원문URL"))
    row["원문URL"] = normalized_source if normalized_source and is_official_url(normalized_source) else EMPTY_UNKNOWN

    # 크롤링이 잘못 집은 파일/Q&A URL이 제거된 뒤에는 검증표의 신청URL을 다시 살린다.
    if row["신청URL"] == EMPTY_UNKNOWN and curated_key:
        curated_apply = normalize_apply_url(
            CURATED_FALLBACKS.get(curated_key, {}).get("fields", {}).get("신청URL")
        )
        if curated_apply:
            row["신청URL"] = curated_apply

    # 현재 공식 출처로 직접 검증된 정책별 보정값을 마지막 병합 이후 우선 적용한다.
    apply_verified_policy_field_overrides(row)

    # CSV 표기 규칙 정규화
    row["최소연령"] = normalize_numeric_condition(row.get("최소연령"))
    row["최대연령"] = normalize_numeric_condition(row.get("최대연령"))
    row["거주기간_개월"] = normalize_numeric_condition(row.get("거주기간_개월"))

    normalized_job = infer_employment(clean_text(row.get("취업상태")))
    if not normalized_job:
        normalized_job = infer_employment(clean_text(row.get("지원대상_원문")))
    row["취업상태"] = normalized_job or EMPTY_UNKNOWN

    for date_col in ["신청시작일", "신청마감일", "운영시작일", "운영종료일", "게시일"]:
        row[date_col] = normalize_output_date(row.get(date_col))
    row["상시모집"] = normalize_always_flag(row.get("상시모집")) or EMPTY_UNKNOWN

    # 최종 연령값/원문을 기준으로 세 가지 값만 사용한다.
    # 정책별 보정에서 청년대상구분을 명시한 경우(예: 청년 외도 신청 가능한 보증료 지원)는 유지한다.
    if row.get("청년대상구분") not in {"청년전용", "청년포함", "연령조건미표기"}:
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
        seed_apply = normalize_apply_url(seed.apply_url)
        if seed_apply:
            row["신청URL"] = seed_apply
    if seed.official_url and row["원문URL"] in {"", EMPTY_UNKNOWN}:
        seed_source = normalize_source_url(seed.official_url)
        if seed_source and is_official_url(seed_source):
            row["원문URL"] = seed_source

    # fallback/seed가 채운 URL도 동일한 규칙으로 다시 검증한다.
    row["신청URL"] = normalize_apply_url(row.get("신청URL")) or EMPTY_UNKNOWN
    source2 = normalize_source_url(row.get("원문URL"))
    row["원문URL"] = source2 if source2 and is_official_url(source2) else EMPTY_UNKNOWN

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

    # 마지막까지 근거를 찾지 못한 값만 '확인필요'.
    # '제한없음'과 '해당없음'은 공식 원문/검증값이 의미를 명확히 뒷받침할 때만 들어간다.
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
    primary_url = normalize_web_url(seed.official_url)
    if primary_url and is_official_url(primary_url):
        crawl_queue.append((primary_url, True))

    if api_obj:
        for k in ("refUrlAddr1", "refUrlAddr2"):
            u = normalize_web_url(api_obj.get(k))
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
        "excluded": False, "exclude_reason": "",
    }
    return row, debug



def make_dynamic_seed(api_obj: dict[str, Any]) -> PolicySeed | None:
    scope, _, _, _ = classify_api_target_region(api_obj)
    if scope not in TARGET_SCOPES:
        return None
    name = clean_text(api_obj.get("plcyNm"))
    if not name:
        return None
    official_url = verified_official_source_for(name) or first_valid_source_url(
        api_obj.get("refUrlAddr1"), api_obj.get("refUrlAddr2")
    ) or None
    apply_url = first_valid_apply_url(api_obj.get("aplyUrlAddr")) or None
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
    for value in [api_obj.get("refUrlAddr1"), api_obj.get("refUrlAddr2"), seed.official_url]:
        u = normalize_source_url(value)
        if u and is_official_url(u) and u not in crawl_queue:
            crawl_queue.append(u)

    apply_doc_url = normalize_apply_url(api_obj.get("aplyUrlAddr"))
    if apply_doc_url and is_official_url(apply_doc_url) and apply_doc_url not in crawl_queue:
        crawl_queue.append(apply_doc_url)

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
        "excluded": False, "exclude_reason": "",
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
        "errors": errors, "method": method, "excluded": False, "exclude_reason": "",
    }


# 관찰된 API/공식 인덱스 중복 명칭을 보수적으로 같은 정책으로 묶는다.
# 일반적인 '지원' 접미사를 무조건 제거하지 않고, 실제 확인된 별칭만 명시한다.
CANONICAL_POLICY_ALIASES: dict[str, str] = {
    # 국토교통부 동일 사업의 전국 안내/부산 시행 행은 부산 이용자용 지역행 하나로 통합
    norm_name("전세보증금반환보증 보증료 지원"): norm_name("전세보증금반환보증 보증료 지원"),
    norm_name("전세보증금반환보증 보증료 지원(전국)"): norm_name("전세보증금반환보증 보증료 지원"),
    norm_name("부산 전세보증금 반환보증 보증료 지원"): norm_name("전세보증금반환보증 보증료 지원"),

    # 같은 청년미래적금 상품의 세제지원 안내 레코드는 본 사업과 하나로 통합
    norm_name("청년미래적금 세제 지원"): norm_name("청년미래적금"),
    norm_name("고교 취업연계 장려금 지원"): norm_name("고교 취업연계 장려금"),
    norm_name("미소금융 청년 미래이음 대출"): norm_name("청년 미래이음 대출"),
    norm_name("유망청년창업기업 보증 지원"): norm_name("유망청년창업기업 보증"),
    norm_name("청년내일저축계좌 운영"): norm_name("청년내일저축계좌"),
    norm_name("청년내일저축계좌 지원"): norm_name("청년내일저축계좌"),
    norm_name("부산 청년내일저축계좌"): norm_name("청년내일저축계좌"),
    norm_name("청년창업농장학금지원"): norm_name("청년창업농장학금"),
    norm_name("취업후상환학자금_등록금"): norm_name("취업 후 상환 학자금대출"),
    norm_name("취업후상환학자금_생활비"): norm_name("취업 후 상환 학자금대출"),

    # 부산 공식 페이지/온통청년 API에서 같은 사업이 다른 이름으로 중복 노출되는 사례
    norm_name("부산 지역인재 장학금 지원"): norm_name("부산지역인재 장학금"),
    norm_name("부산지역인재 장학금 및 취업장려금"): norm_name("부산지역인재 장학금"),
    norm_name("부산 대학생 학자금 대출이자 지원"): norm_name("부산 학자금 대출이자 지원"),
    norm_name("부산광역시 대학(원)생 학자금대출 이자지원"): norm_name("부산 학자금 대출이자 지원"),
    norm_name("학자금 대출이자 지원"): norm_name("부산 학자금 대출이자 지원"),
    norm_name("부산 청년 자산형성 지원(부산청년 기쁨두배통장)"): norm_name("부산청년 기쁨두배통장"),
    norm_name("부산 청년 신용회복 지원"): norm_name("부산 청년 신용회복 지원"),
    norm_name("청년 신용회복지원사업(희망신용상담센터)"): norm_name("부산 청년 신용회복 지원"),
}


def canonical_policy_name(row: dict[str, str]) -> str:
    n = norm_name(row.get("정책명", ""))
    # '학자금 대출이자 지원'이라는 일반명은 부산 범위에서만 부산 정책 별칭으로 취급한다.
    if n == norm_name("학자금 대출이자 지원") and row.get("신청범위") != "부산":
        return n
    return CANONICAL_POLICY_ALIASES.get(n, n)


def source_identity(url: str) -> str:
    """
    동일 공식 상세페이지를 보수적으로 식별한다.
    루트 홈페이지(kosaf.go.kr/, work24.go.kr 등)는 여러 정책이 공유하므로 중복키로 쓰지 않는다.
    """
    u = clean_text(url)
    if not u.startswith("http"):
        return ""
    p = urlparse(u)
    path = (p.path or "").rstrip("/")
    if path in {"", "/", "/ko", "/cm/main.do"}:
        return ""

    from urllib.parse import parse_qs
    q = parse_qs(p.query)

    # 부산청년플랫폼 상세 메뉴
    if "menuCd" in q and q["menuCd"]:
        return f"{p.netloc.lower()}{path}?menuCd={q['menuCd'][0]}"

    # 복지로 정책 ID
    if "wlfareInfoId" in q and q["wlfareInfoId"]:
        return f"{p.netloc.lower()}/welfare?wlfareInfoId={q['wlfareInfoId'][0]}"

    # 콘텐츠형 상세 ID
    if "cntntsId" in q and q["cntntsId"]:
        return f"{p.netloc.lower()}{path}?cntntsId={q['cntntsId'][0]}"

    # 상세 경로가 충분히 구체적일 때만 사용
    if len(path.strip("/").split("/")) >= 2:
        return f"{p.netloc.lower()}{path}?{p.query}" if p.query else f"{p.netloc.lower()}{path}"
    return ""


def _row_date_year(row: dict[str, str]) -> int:
    years: list[int] = []
    for key in ["신청시작일", "신청마감일", "게시일"]:
        v = clean_text(row.get(key))
        m = re.match(r"(20\d{2})", v)
        if m:
            years.append(int(m.group(1)))
    return max(years or [0])


def _row_quality(row: dict[str, str]) -> int:
    """중복 후보 중 최신·정보량 많은 행을 대표행으로 고른다."""
    score = sum(
        1 for v in row.values()
        if clean_text(v) not in {"", EMPTY_UNKNOWN, NO_LIMIT}
    )
    year = _row_date_year(row)
    if year == TODAY.year:
        score += 60
    elif year == TODAY.year - 1:
        score += 20
    elif year:
        score += max(0, year - 2020)

    method = clean_text(row.get("수집방식"))
    if "API" in method:
        score += 3
    if "크롤링" in method:
        score += 5
    if "검증값보완" in method:
        score += 2
    if source_identity(row.get("원문URL", "")):
        score += 3
    return score


def _merge_duplicate_group(group: list[dict[str, str]]) -> dict[str, str]:
    """
    가장 신뢰도 높은 행을 대표로 두고,
    대표행이 확인필요인 필드만 다른 중복행에서 보완한다.
    서로 충돌하는 정상값은 임의로 덮어쓰지 않는다.
    """
    ordered = sorted(group, key=_row_quality, reverse=True)
    merged = dict(ordered[0])

    for other in ordered[1:]:
        for col in ROW_COLUMNS:
            if col not in merged:
                continue
            cur = clean_text(merged.get(col))
            val = clean_text(other.get(col))
            if cur in {"", EMPTY_UNKNOWN} and val not in {"", EMPTY_UNKNOWN}:
                merged[col] = val

    # 다른 중복행의 API 일반값이 수동 검증 연령값을 되살려 덮지 않도록 마지막에 재적용.
    reapply_curated_age_fields(merged)

    # 다른 중복행에서 연령/기간 필드가 보완된 경우 파생값도 다시 계산한다.
    merged["청년대상구분"] = classify_youth_target(merged)
    merged["진행상태"] = calc_status(
        "" if merged.get("신청시작일") in {"", EMPTY_UNKNOWN} else clean_text(merged.get("신청시작일")),
        "" if merged.get("신청마감일") in {"", EMPTY_UNKNOWN} else clean_text(merged.get("신청마감일")),
        clean_text(merged.get("상시모집")),
    )

    names = []
    for r in group:
        n = clean_text(r.get("정책명"))
        if n and n not in names:
            names.append(n)
    if len(group) > 1:
        name_note = f" ({' / '.join(names)})" if names else ""
        merged["비고"] = as_joined([
            merged.get("비고"),
            f"중복후보 통합={len(group)}건{name_note}",
        ])
    return merged


def final_region_sanity(row: dict[str, str]) -> bool:
    """
    최종 출력 단계의 안전 필터.
    - 금융교육/강좌처럼 금전 혜택이 아닌 콘텐츠를 한 번 더 제외
    - 전국으로 판정됐더라도 정책명/기관/공식URL에 특정 타 시·도가 명시되면 제외
    """
    title = clean_text(row.get("정책명"))
    if policy_exclusion_reason(row):
        return False

    if row.get("신청범위") != "전국":
        return True

    strong = as_joined([
        row.get("정책명"), row.get("시행기관"), row.get("운영기관"), row.get("원문URL")
    ], sep=" | ").lower()

    for region, kws in OTHER_REGION_KEYWORDS.items():
        if any(k.lower() in strong for k in kws):
            return False
    return True


def suppress_hope_ladder_umbrella(rows: list[dict[str, str]]) -> list[dict[str, str]]:
    """
    희망사다리 Ⅰ·Ⅱ유형 개별행이 모두 존재하면,
    두 유형을 한 행에 합쳐 놓은 상위 요약행은 중복으로 제거한다.
    개별 유형의 자격·지원조건이 다르므로 Ⅰ/Ⅱ유형 행을 각각 유지한다.
    """
    n1_tokens = [
        norm_name("희망사다리장학금 1유형"),
        norm_name("희망사다리장학금 1유형(중소기업 취업연계)"),
        norm_name("중소기업 취업연계 장학금(희망사다리Ⅰ유형)"),
    ]
    n2_tokens = [
        norm_name("희망사다리장학금 2유형"),
        norm_name("희망사다리장학금 2유형(고졸 후학습자)"),
        norm_name("고졸 후학습자 장학금(희망사다리Ⅱ유형)"),
    ]
    umbrella = norm_name("희망사다리 장학사업(Ⅰ,Ⅱ유형)")

    def matches_any(name: str, tokens: list[str]) -> bool:
        n = norm_name(name)
        return any(tok and (tok in n or n in tok) for tok in tokens)

    has1 = any(matches_any(r.get("정책명", ""), n1_tokens) for r in rows)
    has2 = any(matches_any(r.get("정책명", ""), n2_tokens) for r in rows)
    if not (has1 and has2):
        return rows

    removed_names: list[str] = []
    kept: list[dict[str, str]] = []
    for r in rows:
        if norm_name(r.get("정책명", "")) == umbrella:
            removed_names.append(clean_text(r.get("정책명")))
            continue
        kept.append(r)

    if removed_names:
        # 로그에서 어떤 행이 제거됐는지 추적할 수 있도록 Ⅰ유형 대표행에 메모한다.
        for r in kept:
            if matches_any(r.get("정책명", ""), n1_tokens):
                r["비고"] = as_joined([
                    r.get("비고"),
                    f"상위중복행 제거={' / '.join(removed_names)}; Ⅰ·Ⅱ유형 개별행 유지",
                ])
                break
    return kept


CROSS_SCOPE_PREFER_LOCAL_CANONICAL = {
    norm_name("전세보증금반환보증 보증료 지원"),
}


def merge_verified_cross_scope_duplicates(rows: list[dict[str, str]]) -> list[dict[str, str]]:
    """
    공식 근거로 동일 사업임을 확인한 일부 전국/지역 행만 교차지역 통합한다.
    일반 정책에는 적용하지 않고 allowlist에 있는 사업에만 적용한다.

    부산 청년 서비스이므로 동일 사업의 전국행과 부산행이 함께 있으면
    부산의 신청방법·담당기관 정보가 더 구체적인 부산행을 대표로 유지한다.
    """
    grouped: dict[str, list[dict[str, str]]] = {}
    passthrough: list[dict[str, str]] = []

    for r in rows:
        cname = canonical_policy_name(r)
        if cname in CROSS_SCOPE_PREFER_LOCAL_CANONICAL:
            grouped.setdefault(cname, []).append(r)
        else:
            passthrough.append(r)

    out = passthrough[:]
    for cname, group in grouped.items():
        scopes = {clean_text(r.get("신청범위")) for r in group}
        if len(group) > 1 and "전국" in scopes and "부산" in scopes:
            local_rows = [r for r in group if r.get("신청범위") == "부산"]
            national_rows = [r for r in group if r.get("신청범위") == "전국"]
            local = sorted(local_rows, key=_row_quality, reverse=True)[0]
            merged = dict(local)

            # 부산 공식 안내는 정부24 온라인 신청을 안내하므로,
            # 전국행에 있는 정부24 서비스 상세 URL이 있으면 신청URL로 사용한다.
            gov_apply = ""
            for candidate in group:
                u = normalize_apply_url(candidate.get("신청URL"))
                if u and urlparse(u).netloc.lower().endswith("gov.kr"):
                    gov_apply = u
                    break
            if gov_apply:
                merged["신청URL"] = gov_apply

            # 부산행의 빈 필드만 전국행에서 보완하되 지역/정책명/원문URL은 부산행을 유지.
            protected = {"정책명", "신청범위", "대상시도", "대상시군구", "신청URL", "원문URL"}
            for other in sorted(national_rows, key=_row_quality, reverse=True):
                for col in ROW_COLUMNS:
                    if col in protected:
                        continue
                    cur = clean_text(merged.get(col))
                    val = clean_text(other.get(col))
                    if cur in {"", EMPTY_UNKNOWN} and val not in {"", EMPTY_UNKNOWN}:
                        merged[col] = val

            removed_names = [clean_text(r.get("정책명")) for r in national_rows if clean_text(r.get("정책명"))]
            merged["비고"] = as_joined([
                merged.get("비고"),
                f"전국·부산 동일사업 통합; 부산 시행행 유지; 통합된 전국행={' / '.join(removed_names)}",
            ])
            merged["청년대상구분"] = classify_youth_target(merged)
            out.append(merged)
        else:
            out.extend(group)
    return out


def dedupe_rows(rows: list[dict[str, str]]) -> list[dict[str, str]]:
    """
    1) 최종 지역 sanity check
    2) 동일 상세 공식URL + 동일 지역 중복 통합
    3) 확인된 별칭 + 동일 지역 중복 통합
    """
    filtered = [r for r in rows if final_region_sanity(r)]

    # 1차: 같은 상세 공식페이지를 가리키는 중복
    by_source: dict[tuple[str, str], list[dict[str, str]]] = {}
    source_free: list[dict[str, str]] = []
    for r in filtered:
        sid = source_identity(r.get("원문URL", ""))
        if not sid:
            source_free.append(r)
            continue
        by_source.setdefault((r.get("신청범위", ""), sid), []).append(r)

    stage1: list[dict[str, str]] = source_free[:]
    for group in by_source.values():
        stage1.append(_merge_duplicate_group(group))

    # 2차: 실제 관찰된 별칭 기준. 지역이 다르면 서로 합치지 않는다.
    by_name: dict[tuple[str, str], list[dict[str, str]]] = {}
    for r in stage1:
        key = (r.get("신청범위", ""), canonical_policy_name(r))
        by_name.setdefault(key, []).append(r)

    out: list[dict[str, str]] = []
    for group in by_name.values():
        out.append(_merge_duplicate_group(group))

    # 3차: 같은 공식 상세페이지 + 같은 정책으로 확인되며
    # 전국행과 부산 지역행이 함께 있는 경우 전국행 하나로 통합한다.
    # 예: 청년내일저축계좌 / 부산 청년내일저축계좌
    cross_groups: dict[tuple[str, str], list[dict[str, str]]] = {}
    passthrough: list[dict[str, str]] = []
    for r in out:
        sid = source_identity(r.get("원문URL", ""))
        cname = canonical_policy_name(r)
        if not sid:
            passthrough.append(r)
            continue
        cross_groups.setdefault((sid, cname), []).append(r)

    final_out: list[dict[str, str]] = passthrough[:]
    for group in cross_groups.values():
        scopes = {clean_text(r.get("신청범위")) for r in group}
        if len(group) > 1 and "전국" in scopes:
            national = [r for r in group if r.get("신청범위") == "전국"]
            other = [r for r in group if r.get("신청범위") != "전국"]
            merged = _merge_duplicate_group(national + other)
            # 대표행이 지역행으로 선택되는 것을 막고 전국 범위를 유지
            best_national = sorted(national, key=_row_quality, reverse=True)[0]
            for key in ["신청범위", "대상시도", "대상시군구"]:
                merged[key] = best_national.get(key, merged.get(key, ""))
            final_out.append(merged)
        else:
            final_out.extend(group)

    final_out = suppress_hope_ladder_umbrella(final_out)
    final_out = merge_verified_cross_scope_duplicates(final_out)

    # 중복 병합 과정에서 오래된 API 값이 대표행에 다시 들어오는 것을 방지한다.
    for row in final_out:
        reapply_curated_age_fields(row)
        apply_verified_policy_field_overrides(row)
        n = norm_name(clean_text(row.get("정책명")))
        has_explicit_youth_override = any(
            norm_name(name) == n and "청년대상구분" in values
            for name, values in VERIFIED_POLICY_FIELD_OVERRIDES.items()
        )
        if not has_explicit_youth_override:
            row["청년대상구분"] = classify_youth_target(row)
    return final_out

def build_dedupe_log_map(rows: list[dict[str, str]]) -> dict[str, str]:
    """최종 대표행 비고에서 중복 통합 정보를 읽어 수집로그용 상태를 만든다."""
    out: dict[str, str] = {}
    for r in rows:
        note = clean_text(r.get("비고"))
        if "중복후보 통합=" not in note:
            continue
        representative = clean_text(r.get("정책명"))
        for m in re.finditer(r"중복후보 통합=(\d+)건(?: \(([^)]*)\))?", note):
            count = m.group(1)
            names = [clean_text(x) for x in (m.group(2) or "").split(" / ") if clean_text(x)]
            if representative and representative not in names:
                names.append(representative)
            for name in names:
                if norm_name(name) == norm_name(representative):
                    out[norm_name(name)] = f"대표행 유지({count}건 통합)"
                else:
                    out[norm_name(name)] = f"중복 통합 → {representative}"

        m = re.search(r"상위중복행 제거=([^;]+);", note)
        if m:
            for removed in [clean_text(x) for x in m.group(1).split(" / ") if clean_text(x)]:
                out[norm_name(removed)] = "중복 상위행 제거 → 희망사다리 Ⅰ·Ⅱ유형 개별행 유지"

        m = re.search(r"통합된 전국행=([^|]+)", note)
        if m:
            for removed in [clean_text(x) for x in m.group(1).split(" / ") if clean_text(x)]:
                out[norm_name(removed)] = f"전국·부산 동일사업 통합 → {representative}"
    return out


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


def run_self_tests() -> None:
    """네트워크/API 호출 없이 핵심 보수 규칙을 회귀 테스트한다."""
    checks: list[tuple[str, bool]] = []

    def check(name: str, condition: bool) -> None:
        checks.append((name, bool(condition)))
        if not condition:
            raise AssertionError(f"[SELF-TEST FAIL] {name}")

    # 1) fallback은 정상 API/크롤링 값을 덮어쓰지 않는다.
    seed = PolicySeed(
        name="청년주택드림청약통장",
        api_queries=[],
        official_url=None,
        expected_scope="전국",
    )
    row = blank_row()
    row["지원대상_원문"] = "API 정상값"
    filled, _ = apply_curated_fallback(row, seed)
    check("fallback does not overwrite normal value", row["지원대상_원문"] == "API 정상값")
    check("normal value is not reported as curated fill", "지원대상_원문" not in filled)

    # 2) 확인필요/빈 값에만 검증값이 적용된다.
    row2 = blank_row()
    row2["지원대상_원문"] = EMPTY_UNKNOWN
    filled2, note2 = apply_curated_fallback(row2, seed)
    check("fallback applies to 확인필요", "연소득 5천만원 이하" in row2["지원대상_원문"])
    check("filled field tracked", "지원대상_원문" in filled2)
    check("curated official source trace", "molit.go.kr/2024dreamaccount" in note2)

    # 3) 검증표가 없는 정책은 근거 없는 값을 만들지 않는다.
    unknown_seed = PolicySeed(
        name="검증되지않은정책",
        api_queries=[],
        official_url=None,
        expected_scope="전국",
    )
    row3 = blank_row()
    before3 = dict(row3)
    filled3, _ = apply_curated_fallback(row3, unknown_seed)
    check("no fabricated curated fields", filled3 == [] and row3 == before3)
    check("no auto-generated 해당없음", all(v != NOT_APPLICABLE for v in row3.values()))

    # 3-1) 세 sentinel 의미를 구분한다. 값이 없으면 확인필요, 조건 없음이 명시되면 제한없음,
    #      허용 선택지 비해당이 명시되면 해당없음.
    profile_unknown = blank_row()
    profile_unknown["정책명"] = "테스트 신규 정책 A"
    inferred_unknown = infer_profile_columns(profile_unknown)
    check("profile missing means 확인필요", inferred_unknown["최종학력"] == EMPTY_UNKNOWN)

    profile_no_limit = blank_row()
    profile_no_limit["정책명"] = "테스트 신규 정책 B"
    profile_no_limit["학력·재학조건"] = "학력 조건 제한 없음"
    inferred_no_limit = infer_profile_columns(profile_no_limit)
    check("explicit no condition means 제한없음", inferred_no_limit["최종학력"] == NO_LIMIT)

    profile_na = blank_row()
    profile_na["정책명"] = "테스트 신규 정책 C"
    profile_na["특화대상_원문"] = "특화대상: 해당없음"
    inferred_na = infer_profile_columns(profile_na)
    check("explicit non-applicable means 해당없음", inferred_na["특화대상"] == NOT_APPLICABLE)

    # 4) 시행기관은 명시적으로 검증한 curated 항목만 보완한다.
    agency_seed = PolicySeed(
        name="부산 전세보증금 반환보증 보증료 지원",
        api_queries=[],
        official_url=None,
        expected_scope="부산",
    )
    agency_row = blank_row()
    agency_filled, _ = apply_curated_fallback(agency_row, agency_seed)
    check("verified implementing agency fill", agency_row["시행기관"] == "부산광역시(구·군)")
    check("implementing agency tracked", "시행기관" in agency_filled)

    # 5) 신청URL 정규화: 실제 신청포털은 허용, 정책 상세/공지/다운로드는 차단.
    check("scheme-less URL normalization", normalize_web_url("www.example.go.kr/app") == "https://www.example.go.kr/app")
    check("e든든 apply URL allowed", normalize_apply_url("https://enhuf.molit.go.kr/") == "https://enhuf.molit.go.kr/")
    check("KOSAF info page rejected as apply URL", normalize_apply_url("https://www.kosaf.go.kr/ko/scholar.do?pg=abc") == "")
    check("Busan youth info page rejected as apply URL", normalize_apply_url("https://young.busan.go.kr/index.nm?menuCd=49") == "")
    check("NHUF product detail rejected as apply URL", normalize_apply_url("https://nhuf.molit.go.kr/FP/FP05/test.jsp") == "")
    check("FAQ/download rejected as apply URL", normalize_apply_url("https://example.go.kr/faq/view") == "")

    # 6) 연령 파서와 청년대상구분.
    check("age range 18-39", extract_age("만 18세~39세")[:2] == ("18", "39"))
    check("age range 19 이상 39 이하", extract_age("만 19세 이상 만 39세 이하")[:2] == ("19", "39"))
    check("single max age 55", extract_age("만 55세 이하")[:2] == ("", "55"))
    check("group upper ages 35/40", extract_age("학부 만 35세 / 대학원 만 40세")[:2] == ("", "40"))
    youth_row = blank_row()
    youth_row["연령조건_원문"] = "학부 만 35세 / 대학원 만 40세"
    youth_row["최소연령"] = EMPTY_UNKNOWN
    youth_row["최대연령"] = "40"
    check("group age classified youth included", classify_youth_target(youth_row) == "청년포함")

    # 7) 지역 판정: 부산 여러 구·군은 전국으로 확대하지 않는다.
    scope, sido, sigungu = infer_scope(
        "26110,26140,26170,26200,26230,26260,26290,26320,26350,26380,26410,26440,26470,26500,26530,26710",
        "",
        None,
    )
    check("many Busan codes stay Busan", (scope, sido, sigungu) == ("부산", "부산광역시", ""))
    check("Busanjin exact code", infer_scope("26230", "", None)[0] == "부산진구")
    check("Saha exact code", infer_scope("26380", "", None)[0] == "사하구")

    # 8) 중복 제거 특수규칙: 희망사다리 상위 통합행 제거.
    def test_row(name: str) -> dict[str, str]:
        r = blank_row()
        r.update({
            "정책명": name,
            "신청범위": "전국",
            "대상시도": "전국",
            "대상시군구": NO_LIMIT,
            "원문URL": EMPTY_UNKNOWN,
            "수집방식": "API",
            "연령조건_원문": "공식자료에 별도 연령조건 미표기",
            "최소연령": EMPTY_UNKNOWN,
            "최대연령": EMPTY_UNKNOWN,
        })
        return r

    deduped = dedupe_rows([
        test_row("희망사다리 장학사업(Ⅰ,Ⅱ유형)"),
        test_row("희망사다리장학금 1유형(중소기업 취업연계)"),
        test_row("희망사다리장학금 2유형(고졸 후학습자)"),
    ])
    dedupe_names = {r["정책명"] for r in deduped}
    check("hope-ladder umbrella removed", "희망사다리 장학사업(Ⅰ,Ⅱ유형)" not in dedupe_names)
    check("hope-ladder individual rows kept", len(dedupe_names) == 2)

    # 9) 검증 우선 override는 allowlist 정책에만 작동한다.
    ordinary = blank_row()
    ordinary["정책명"] = "검증되지않은정책"
    ordinary["신청URL"] = "https://example.go.kr/apply"
    apply_verified_policy_field_overrides(ordinary)
    check("verified override does not touch unlisted policy", ordinary["신청URL"] == "https://example.go.kr/apply")
    busan_interest_override = VERIFIED_POLICY_FIELD_OVERRIDES["부산 학자금 대출이자 지원"]
    check("Busan student-loan verified fields preserved", "2025년 7월~2026년 6월" in busan_interest_override["지원내용"])
    check("Busan student-loan detail page not apply URL", busan_interest_override["신청URL"] == EMPTY_UNKNOWN)
    boogi_curated = CURATED_FALLBACKS["부산청년 기쁨두배통장"]
    check("Boogi curated dates preserved", boogi_curated["fields"]["신청시작일"] == "2026-08-10")
    check("Boogi implementing agency merged", boogi_curated["fields"]["시행기관"] == "부산광역시(경제진흥원)")

    meomul = blank_row()
    meomul["정책명"] = "부산 청년 임차보증금 대출 및 대출이자 지원(머물자리론)"
    meomul["신청URL"] = "https://young.busan.go.kr/index.nm?menuCd=0"
    apply_verified_policy_field_overrides(meomul)
    check("verified detail URL correction", meomul["신청URL"] == EMPTY_UNKNOWN)


    # 10) 사이트 메뉴 오염 탐지 회귀 테스트.
    kosaf_noise = "관리 / 근로기관 참여제한 관리 / 신청하기 / 신청현황 / 온라인 사전교육 / 수혜내역 / 증서발급 / 선정결과"
    check("KOSAF menu cluster detected", looks_like_navigation_cluster(kosaf_noise, KOSAF_MENU_CLUSTER_TOKENS, threshold=2))
    cleaned_kosaf = clean_kosaf_menu_pollution({"제외대상": kosaf_noise, "지원내용": "정상 지원내용"})
    check("KOSAF polluted exclusion removed", cleaned_kosaf["제외대상"] == "")
    check("KOSAF normal support preserved", cleaned_kosaf["지원내용"] == "정상 지원내용")

    busan_noise = "부산청년 기쁨두배통장 / 청년내일저축계좌 / 대학생 기숙사비 지원 / 청년 신용회복지원사업(희망신용상담센터)"
    cleaned_busan = clean_busan_youth_menu_pollution({"지원대상_원문": busan_noise, "학력·재학조건": busan_noise})
    check("Busan youth menu target removed", cleaned_busan["지원대상_원문"] == "")
    check("Busan youth menu school removed", cleaned_busan["학력·재학조건"] == "")

    # 11) 최신 CSV에서 발견된 정책별 오염을 공식 검증값으로 교정.
    general_loan = blank_row()
    general_loan["정책명"] = "일반 상환 학자금대출"
    general_loan["지원내용"] = "학적 변동 또는 장학금 수령 등 사유로 인해 상환해야 할 등록금대출"
    general_loan["소득조건"] = "등록마감일로부터 약 8주 전 신청 권장"
    general_loan["수집방식"] = "크롤링"
    apply_verified_policy_field_overrides(general_loan)
    check("general loan support corrected", "등록금·생활비" in general_loan["지원내용"])
    check("general loan income corrected", "지원구간 제한 없음" in general_loan["소득조건"])
    check("verified correction method tracked", "공식검증보정" in general_loan["수집방식"])

    housing_scholar = blank_row()
    housing_scholar["정책명"] = "주거안정장학금"
    housing_scholar["연령조건_원문"] = "연령제한 없음"
    housing_scholar["최소연령"] = NO_LIMIT
    housing_scholar["최대연령"] = NO_LIMIT
    apply_verified_policy_field_overrides(housing_scholar)
    check("housing scholarship age corrected", housing_scholar["최대연령"] == "39")
    check("housing scholarship youth class corrected", housing_scholar["청년대상구분"] == "청년포함")

    nhuf_row = blank_row()
    nhuf_row["정책명"] = "청년전용 보증부 월세대출"
    nhuf_row["지원대상_원문"] = "대출금 지급방법"
    apply_verified_policy_field_overrides(nhuf_row)
    check("NHUF target corrected", "청년 단독세대주" in nhuf_row["지원대상_원문"])

    tech_scholar = blank_row()
    tech_scholar["정책명"] = "전문기술인재 장학금 지원"
    tech_scholar["지원대상_원문"] = EMPTY_UNKNOWN
    tech_scholar["신청마감일"] = "2026-09-30"
    apply_verified_policy_field_overrides(tech_scholar)
    check("technical talent target corrected", "사업 참여 전문대학 재학생" in tech_scholar["지원대상_원문"])
    check("technical talent uncertain end date cleared", tech_scholar["신청마감일"] == EMPTY_UNKNOWN)

    military = blank_row()
    military["정책명"] = "장병내일준비적금 지원"
    military["지원금액"] = "20만원, 40만원, 30만원, 55만원, 5%, 1%, 33%, 71%, 100%"
    apply_verified_policy_field_overrides(military)
    check("military savings amount normalized", "납입원금의 100% 매칭지원금" in military["지원금액"])

    # 12) v11.6: 청년전용 보증부월세 연령 정규화값은 공식 검증값으로 강제한다.
    nhuf_age = blank_row()
    nhuf_age["정책명"] = "청년전용 보증부 월세대출"
    nhuf_age["연령조건_원문"] = "연령제한 없음"
    nhuf_age["최소연령"] = NO_LIMIT
    nhuf_age["최대연령"] = NO_LIMIT
    apply_verified_policy_field_overrides(nhuf_age)
    check("NHUF verified min age forced", nhuf_age["최소연령"] == "19")
    check("NHUF verified max age forced", nhuf_age["최대연령"] == "34")
    check("NHUF youth-only classification forced", nhuf_age["청년대상구분"] == "청년전용")

    # 13) v11.6: 이공계 국가우수장학금 지원대상에서 타 장학사업/뉴스 메뉴를 제거한다.
    science_seed = PolicySeed(
        name="이공계 우수학생 국가장학금", api_queries=[], official_url=None, expected_scope="전국"
    )
    science_polluted = {
        "지원대상_원문": (
            "대한민국 국적 / 국내 4년제 대학 자연과학·공학계열 신입생 또는 3학년 재학생 / "
            "공지사항 / 희망사다리장학금 2유형(고졸 후학습자) / 장학금 한눈에 보기"
        ),
        "학력·재학조건": "자연과학·공학계열 재학생",
        "제외대상": "",
    }
    science_cleaned = clean_kosaf_policy_specific_pollution(science_polluted, science_seed)
    check("science scholarship valid target preserved", "자연과학·공학계열" in science_cleaned["지원대상_원문"])
    check("science scholarship other-program menu removed", "희망사다리" not in science_cleaned["지원대상_원문"])
    check("science scholarship news menu removed", "공지사항" not in science_cleaned["지원대상_원문"])

    # 14) v11.6: 게시일 파서는 공고일 기준 출생연도(2008-12-31)를 게시일로 오인하지 않는다.
    boogi_body = "신청자격 : 공고일('26. 8. 3.) 현재 / 연령 18세~39세 / 1986. 1. 1. ~ 2008. 12. 31. 출생"
    check("posted date ignores eligibility birth date", extract_posted_date(boogi_body) == "")
    check("posted date reads separated metadata", extract_posted_date("공고일자\n2026.08.03\n내용") == "2026-08-03")
    check("posted date reads inline metadata", extract_posted_date("작성자 김승혜 | 작성일 : 2026.08.05 | 조회수 100") == "2026-08-05")

    # 15) v11.6: 희망사다리Ⅱ는 2026년 실제 2학기 모집 연장일정을 사용한다.
    hope2 = blank_row()
    hope2["정책명"] = "희망사다리장학금 2유형(고졸 후학습자)"
    hope2["신청시작일"] = "2025-01-01"
    hope2["신청마감일"] = "2025-12-31"
    apply_verified_policy_field_overrides(hope2)
    check("Hope II 2026 start date forced", hope2["신청시작일"] == "2026-09-01")
    check("Hope II 2026 extended end date forced", hope2["신청마감일"] == "2026-09-30")
    check("Hope II source is 2026 extension notice", "seqNo=21320" in hope2["원문URL"])

    passed = sum(1 for _, ok in checks if ok)
    print(f"[SELF-TEST] PASS {passed}/{len(checks)}")


def main() -> None:
    load_dotenv()
    parser = argparse.ArgumentParser(
        description="부산 청년 AI 생활·혜택 안내 서비스 - 장학·금융 자동 탐색 수집기 v11.7"
    )
    parser.add_argument("--out-dir", default="output", help="CSV 출력 폴더 (기본: output)")
    parser.add_argument("--no-api", action="store_true", help="온통청년 API 없이 공식사이트 크롤링만 수행")
    parser.add_argument("--no-local-index", action="store_true", help="부산청년플랫폼 등 공식 인덱스 자동탐색 생략")
    parser.add_argument("--max-pages", type=int, default=6, help="API 검색어별 최대 페이지 수 (기본: 6)")
    parser.add_argument("--self-test", action="store_true", help="네트워크/API 없이 핵심 정규화·fallback·중복 규칙 테스트 후 종료")
    parser.add_argument(
        "--region", default="",
        choices=["전국", "부산", "부산진구", "사하구"],
        help="특정 지역만 출력하고 싶을 때 사용",
    )
    args = parser.parse_args()

    if args.self_test:
        run_self_tests()
        return

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
        logs.extend(api.discovery_exclusions)
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
    dedupe_log_map = build_dedupe_log_map(results)
    if args.region:
        results = [r for r in results if r.get("신청범위") == args.region]

    # v11.8: 최종 수집·검증·중복제거 결과를 기준으로 확정 선택형 프로필 컬럼 생성
    for row in results:
        apply_profile_columns(row)

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
                "지역판정": x.get("api_match_note", ""),
                "크롤링URL": " | ".join(x.get("crawl_urls", [])),
                "크롤링오류": " | ".join(
                    e for e in x.get("errors", []) if "크롤링" in str(e) or "robots" in str(e).lower()
                ),
                "검증값보완필드": ", ".join(x.get("curated_fields", [])),
                "중복제거여부": dedupe_log_map.get(
                    norm_name(x.get("api_plcyNm") or x.get("seed", "")),
                    "제외" if x.get("excluded") else "유지",
                ),
                "제외여부": "예" if x.get("excluded") else "아니오",
                "제외사유": x.get("exclude_reason", ""),
                "수집방식": "+".join(x.get("method", [])),
                "기타오류": " | ".join(
                    e for e in x.get("errors", []) if "크롤링" not in str(e) and "robots" not in str(e).lower()
                ),
            }
            for x in logs
        ],
        [
            "정책명", "API검색어", "API매칭점수", "API정책번호", "API정책명", "지역판정",
            "크롤링URL", "크롤링오류", "검증값보완필드", "중복제거여부",
            "제외여부", "제외사유", "수집방식", "기타오류",
        ],
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
