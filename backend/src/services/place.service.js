import * as placeRepo from '../repositories/place.repository.js';
import { AppError } from '../utils/response.js';

// 행사 진행 상태: 시작일이 지금 이전이거나 같으면 '진행 중', 아니면 '예정' (FR-MAP-014)
const eventStatus = (startAt, now = Date.now()) =>
  !startAt || new Date(startAt).getTime() <= now ? '진행 중' : '예정';

function toEvent(row) {
  return {
    policy_id: row.policy.policy_id,
    title: row.policy.title,
    detail_url: row.policy.official_url,
    collected_at: row.policy.last_collected_at,
    genre: row.genre,
    start_at: row.event_start_at,
    end_at: row.event_end_at,
    status: eventStatus(row.event_start_at),
    is_free: row.price === 0,
    price_text: row.price_text,
    schedule_text: row.schedule_text,
    age_rating: row.age_rating,
    runtime: row.runtime,
    organizer: row.organizer,
    casting: row.casting,
    crew: row.crew,
  };
}

// 장소별 가장 빠른 진행·예정 행사의 상태와 행사 수 (장소 카드의 상태 표시: FR-MAP-010)
function eventSummary(events) {
  const byPlace = new Map();
  for (const row of events) {
    const cur = byPlace.get(row.place_id) ?? { live_event_count: 0, next_event_status: null };
    if (cur.live_event_count === 0) cur.next_event_status = eventStatus(row.event_start_at);
    cur.live_event_count += 1;
    byPlace.set(row.place_id, cur);
  }
  return byPlace;
}

// 다음 자동 갱신 시각. 이 서버에서 하루 1회 갱신을 켰고 '분 시 * * *' 형식일 때만 계산한다 (NFR-006)
function nextSyncAt(now = new Date()) {
  if (process.env.CULTURE_SYNC_ENABLED !== 'true') return null;
  const m = (process.env.CULTURE_SYNC_CRON || '0 4 * * *').match(/^(\d{1,2}) (\d{1,2}) \* \* \*$/);
  if (!m) return null;
  const kst = new Date(now.getTime() + 9 * 3600e3); // 한국 시각을 UTC 값처럼 다룬다
  const next = new Date(
    Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate(), Number(m[2]), Number(m[1]))
  );
  if (next <= kst) next.setUTCDate(next.getUTCDate() + 1);
  return new Date(next.getTime() - 9 * 3600e3).toISOString();
}

export async function listPlaces() {
  const [places, categories, events, lastSync] = await Promise.all([
    placeRepo.findMapPlaces(),
    placeRepo.findMapCategories(),
    placeRepo.findLiveEvents(),
    placeRepo.findLastCultureSync(),
  ]);
  const summary = eventSummary(events);
  const items = places.map((p) => ({
    ...p,
    ...(summary.get(p.place_id) ?? { live_event_count: 0, next_event_status: null }),
  }));
  return {
    items,
    categories,
    totalCount: items.length,
    // 최근 수집 성공 시각과 다음 예정 시각 (화면이 최신성 안내에 쓴다)
    sync: { last_success_at: lastSync?.finished_at ?? null, next_run_at: nextSyncAt() },
  };
}

// 찜 (P2). 로그인한 사용자 본인 것만
export const listSavedPlaces = (userId) => placeRepo.findSavedPlaceIds(userId);

export async function savePlace(userId, placeId) {
  if (!(await placeRepo.findMapPlace(placeId)))
    throw new AppError(404, 'PLACE_NOT_FOUND', '장소를 찾을 수 없습니다.');
  await placeRepo.insertSavedPlace(userId, placeId);
}

export const unsavePlace = (userId, placeId) => placeRepo.deleteSavedPlace(userId, placeId);

export async function getPlace(placeId) {
  const place = await placeRepo.findMapPlace(placeId);
  if (!place) throw new AppError(404, 'PLACE_NOT_FOUND', '장소를 찾을 수 없습니다.');
  const events = (await placeRepo.findLiveEvents(placeId)).map(toEvent);
  return { ...place, events };
}
