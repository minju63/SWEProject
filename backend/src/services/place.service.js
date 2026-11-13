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

export async function listPlaces() {
  const [places, categories, events] = await Promise.all([
    placeRepo.findMapPlaces(),
    placeRepo.findMapCategories(),
    placeRepo.findLiveEvents(),
  ]);
  const summary = eventSummary(events);
  const items = places.map((p) => ({
    ...p,
    ...(summary.get(p.place_id) ?? { live_event_count: 0, next_event_status: null }),
  }));
  return { items, categories, totalCount: items.length };
}

export async function getPlace(placeId) {
  const place = await placeRepo.findMapPlace(placeId);
  if (!place) throw new AppError(404, 'PLACE_NOT_FOUND', '장소를 찾을 수 없습니다.');
  const events = (await placeRepo.findLiveEvents(placeId)).map(toEvent);
  return { ...place, events };
}
