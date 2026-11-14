import { supabase } from '../lib/supabase.js';

// 지도 표시 대상 장소 (v_map_places: 사용 중 + 좌표 있음 + 분류표에 있는 유형)
const PLACE_COLUMNS =
  'place_id, place_key, name, place_type, category_code, category_name, sort_order, color, ' +
  'region_code, district, address, lat, lng, coord_status, tel, homepage_url, ' +
  'open_hours_text, closed_days_text, fee_text, is_free, fee_type, reservation_url, capacity, ' +
  'image_url, image_source, description, source_name, last_collected_at, source_checked_at';

const EVENT_COLUMNS =
  'place_id, genre, venue_text, event_start_at, event_end_at, schedule_text, price, price_text, ' +
  'age_rating, runtime, organizer, casting, crew, ' +
  'policy:policy_id!inner (policy_id, title, official_url, item_type, last_collected_at)';

export async function findMapPlaces() {
  const { data, error } = await supabase.from('v_map_places').select(PLACE_COLUMNS).order('name');
  if (error) throw error;
  return data;
}

export async function findMapPlace(placeId) {
  const { data, error } = await supabase
    .from('v_map_places')
    .select(PLACE_COLUMNS)
    .eq('place_id', placeId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function findMapCategories() {
  const { data, error } = await supabase
    .from('map_category')
    .select('category_code, category_name, sort_order, color')
    .order('sort_order');
  if (error) throw error;
  return data;
}

// 종료일이 지금 이후인 행사 (종료일 없는 행사는 제외: FR-MAP-014). placeId 가 없으면 장소에 연결된 전체
export async function findLiveEvents(placeId) {
  let query = supabase
    .from('culture_detail')
    .select(EVENT_COLUMNS)
    .eq('policy.item_type', 'EVENT')
    .gte('event_end_at', new Date().toISOString())
    .order('event_start_at', { ascending: true, nullsFirst: true });
  query = placeId ? query.eq('place_id', placeId) : query.not('place_id', 'is', null);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

// 마지막으로 성공(부분 성공 포함)한 문화 데이터 갱신 (NFR-006 최신성)
export async function findLastCultureSync() {
  const { data, error } = await supabase
    .from('collection_run')
    .select('finished_at, status')
    .eq('collection_domain', 'CULTURE')
    .in('status', ['성공', '부분 성공'])
    .order('finished_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  return data[0] ?? null;
}

// 찜한 장소 (user_saved_places: 사용자 번호·장소 번호·찜한 시각만, FR-MAP-019)
export async function findSavedPlaceIds(userId) {
  const { data, error } = await supabase
    .from('user_saved_places')
    .select('place_id')
    .eq('user_id', userId)
    .order('saved_at');
  if (error) throw error;
  return data.map((r) => r.place_id);
}

export async function insertSavedPlace(userId, placeId) {
  const { error } = await supabase
    .from('user_saved_places')
    .upsert(
      { user_id: userId, place_id: placeId },
      { onConflict: 'user_id,place_id', ignoreDuplicates: true }
    );
  if (error) throw error;
}

export async function deleteSavedPlace(userId, placeId) {
  const { error } = await supabase
    .from('user_saved_places')
    .delete()
    .eq('user_id', userId)
    .eq('place_id', placeId);
  if (error) throw error;
}
