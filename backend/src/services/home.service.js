// 홈 탭 데이터 (SRS FR-H03~H12)
import * as homeRepo from '../repositories/home.repository.js';
import { RESULT } from './eligibility.service.js';
import {
  ageOf,
  isOpen,
  judgedWithRegion,
  loadContext,
  sortRecommended,
  toCard,
} from './recommend.service.js';

const PREVIEW_SIZE = 3; // FR-H10: 분야 미리보기 최대 3건
const CLOSING_DAYS = 14; // FR-H03: 마감 2주 이내
const CLOSING_MAX = 10;
const SPACE_CATEGORY = '공간·시설'; // 이 분야의 '정책'(청년공간 운영·대여 등)만 센다. 도서관 같은 장소는 지도 탭에서 본다

// A partial profile mismatch excludes a card only when it blocks a required
// path. An unknown OR alternative must never be treated as a mismatch.
export function hasBlockingProfileMismatch(eligibility) {
  function evaluate(item) {
    if (item.exclusion) return null;
    if (item.children?.length) {
      const op = String(item.operator ?? item.op ?? (item.any ? 'OR' : item.all ? 'AND' : '')).toUpperCase();
      if (!['AND', 'OR'].includes(op)) return null;
      const children = item.children.map(evaluate);
      if (op === 'AND') return children.includes(false) ? false : children.every((value) => value === true) ? true : null;
      return children.includes(true) ? true : children.every((value) => value === false) ? false : null;
    }
    if (!item.profile_comparison && !item.profile_reviewed) return null;
    if (item.status === 'UNSATISFIED') return false;
    if (item.status === 'SATISFIED') return true;
    return null;
  }
  return (eligibility?.conditions ?? []).some((item) => evaluate(item) === false);
}

export function sortHomePreview(items) {
  const urgency = (p) => !p.is_always_open && Number.isFinite(p.d_day) && p.d_day >= 0 ? p.d_day : Infinity;
  return [...items].sort((a, b) =>
    (a.eligibility.result === RESULT.ELIGIBLE ? 0 : 1) - (b.eligibility.result === RESULT.ELIGIBLE ? 0 : 1) ||
    urgency(a) - urgency(b) || a.title.localeCompare(b.title, 'ko'));
}

export async function getHome(userId) {
  const { profile, categories, policies, regions } = await loadContext(userId);
  const [bookmarks] = await Promise.all([userId ? homeRepo.findBookmarkedIds(userId) : []]);
  const bookmarked = new Set(bookmarks.map((b) => b.policy_id));

  const all = judgedWithRegion(policies, profile, regions);
  const open = all.filter(isOpen); // 모집 중·상시 (모집 예정·마감 제외)
  const mine = open.filter((p) => p.eligibility.result !== RESULT.INELIGIBLE && !hasBlockingProfileMismatch(p.eligibility));

  const withMark = (p) => toCard(p, { bookmarked: bookmarked.has(p.policy_id) });
  const preview = (list) => {
    const sorted = sortHomePreview(list);
    return { total: list.length, items: sorted.slice(0, PREVIEW_SIZE).map(withMark) };
  };

  const categoryRows = categories.map((c) => {
    const isSpace = c.category_name === SPACE_CATEGORY;
    const inCat = (p) => p.category_id === c.category_id;
    return {
      category_id: c.category_id,
      category_name: c.category_name,
      sort_order: c.sort_order,
      is_space: isSpace,
      // 공간·시설도 다른 분야처럼 정책 카드를 보여 준다 (장소 목록은 지도 탭)
      mine: preview(mine.filter(inCat)),
      all: preview((userId ? mine : open).filter(inCat)),
    };
  });

  const hasProfile = Boolean(
    profile?.birth_date ||
    profile?.region_code ||
    (Array.isArray(profile?.current_status)
      ? profile.current_status.length
      : profile?.current_status)
  );
  const region = regions.find((r) => r.region_code === profile?.region_code);

  // AI 맞춤 추천 카드: 관심분야 일치 → 나머지 순으로 최대 3건 (FR-A08과 같은 규칙)
  const topPicks = sortRecommended(mine, profile, categories)
    .slice(0, PREVIEW_SIZE)
    .map((p) => p.title);

  // 찜한 정책 중 마감 14일 이내 (D-day 순)
  const closing = (userId ? mine : open)
    .filter((p) => bookmarked.has(p.policy_id) && !p.is_always_open)
    .filter((p) => p.d_day != null && p.d_day >= 0 && p.d_day <= CLOSING_DAYS)
    .sort((a, b) => a.d_day - b.d_day)
    .slice(0, CLOSING_MAX)
    .map((p) =>
      toCard(p, {
        bookmarked: true,
      })
    );

  return {
    profile: {
      has_profile: hasProfile,
      region_name: region?.region_name ?? null,
      age: ageOf(profile?.birth_date),
      current_status: profile?.current_status ?? null,
      interest_categories: profile?.interest_categories ?? [],
    },
    mine_total: mine.length,
    all_total: (userId ? mine : open).length,
    categories: categoryRows,
    top_picks: topPicks,
    closing_bookmarks: closing,
  };
}
