// 새 소식 알림 (FR-MY-012~015): 새로 등록된 정책·문화행사·시설을 알림 센터에 넣는다.
//  - 맞춤 알림(NEW_MATCH): 새 정책 중 내 맞춤정보로 신청할 수 있고 관심 분야에 맞는 것
//  - 정책 알림(POLICY): 새로 등록된 청년정책
//  - 문화행사 알림(EVENT): 새로 등록된 문화행사
//  - 주변 시설 알림(FACILITY): 내 거주 구에 새로 등록된 시설 (현재 위치 좌표는 쓰지 않는다)
// "새로"는 최근 NEW_WINDOW_HOURS 시간(기본 48) 안에 DB 에 들어온 것이고, 같은 소식은 한 번만 보낸다.
import { supabase } from '../lib/supabase.js';
import * as userRepo from '../repositories/user.repository.js';
import { loadContext, isInterest, isOpen, judgedWithRegion } from '../services/recommend.service.js';
import { RESULT } from '../services/eligibility.service.js';
import { notifications } from '../services/notifications.service.js';

const WINDOW_HOURS = Number(process.env.NEW_WINDOW_HOURS) || 48;
const SHOWN = 2; // 알림 본문에 이름을 적는 개수

const names = (items, key = 'title') => {
  const list = items.slice(0, SHOWN).map((i) => i[key]);
  return list.join(', ') + (items.length > SHOWN ? ` 외 ${items.length - SHOWN}건` : '');
};

// 사용자 한 명에게 보낼 알림을 정한다 (DB 를 건드리지 않는 순수 함수)
// settings: 알림 설정, matched: 맞춤 정책, newPolicies/newEvents: 새 정책·행사, myPlaces: 내 구의 새 시설, guName: 거주 구 이름
export function planNotifications({ settings, matched = [], newPolicies = [], newEvents = [], myPlaces = [], guName = '' }) {
  if (!settings?.enabled) return [];
  const rows = [];
  const matchedIds = new Set();
  if (settings.recommendations && matched.length) {
    matched.forEach((p) => matchedIds.add(p.policy_id));
    rows.push({
      type: 'NEW_MATCH',
      policy_id: matched[0].policy_id,
      ids: matched.map((p) => p.policy_id),
      title: `나에게 맞는 새 혜택 ${matched.length}건이 생겼어요`,
      body: names(matched),
      link: matched.length === 1 ? `/policies/${matched[0].policy_id}` : '/search?mine=1',
    });
  }
  const rest = newPolicies.filter((p) => !matchedIds.has(p.policy_id));
  if (settings.policyAlerts && rest.length)
    rows.push({
      type: 'POLICY',
      policy_id: rest[0].policy_id,
      ids: rest.map((p) => p.policy_id),
      title: `새 청년정책 ${rest.length}건이 등록됐어요`,
      body: names(rest),
      link: rest.length === 1 ? `/policies/${rest[0].policy_id}` : '/search',
    });
  if (settings.eventAlerts && newEvents.length)
    rows.push({
      type: 'EVENT',
      policy_id: newEvents[0].policy_id,
      ids: newEvents.map((p) => p.policy_id),
      title: `새 문화행사 ${newEvents.length}건이 등록됐어요`,
      body: names(newEvents),
      link: `/policies/${newEvents[0].policy_id}`,
    });
  if (settings.facilityAlerts && myPlaces.length)
    rows.push({
      type: 'FACILITY',
      policy_id: null,
      ids: myPlaces.map((p) => p.place_id),
      title: `${guName}에 새 시설 ${myPlaces.length}곳이 생겼어요`,
      body: names(myPlaces, 'name'),
      link: `/map?placeId=${myPlaces[0].place_id}`,
    });
  return rows;
}

const checked = ({ data, error }) => {
  if (error) throw error;
  return data ?? [];
};

export async function runContentNotifications({ now = new Date(), dryRun = false } = {}) {
  const since = new Date(now.getTime() - WINDOW_HOURS * 3600_000).toISOString();
  const [items, places, users] = await Promise.all([
    supabase.from('policy').select('policy_id, title, item_type, category_id, created_at').gte('created_at', since).then(checked),
    supabase.from('place').select('place_id, name, region_code, created_at').eq('is_active', true).gte('created_at', since).then(checked),
    supabase.from('user_profile').select('user_id').then(checked),
  ]);
  const newPolicyIds = new Set(items.filter((i) => i.item_type === 'POLICY').map((i) => i.policy_id));
  const newEvents = items.filter((i) => i.item_type === 'EVENT');
  const result = { users: users.length, sent: 0, skipped: 0, failed: 0 };
  if (!items.length && !places.length) return result;

  let typeWarned = false;
  for (const { user_id: userId } of users) {
    try {
      const [settings, ctx] = await Promise.all([notifications.settings(userId), loadContext(userId)]);
      const profile = ctx.profile;
      const open = ctx.policies.filter((p) => newPolicyIds.has(p.policy_id) && isOpen(p));
      const matched = profile
        ? judgedWithRegion(open, profile, ctx.regions).filter(
            (p) => p.eligibility.result !== RESULT.INELIGIBLE && isInterest(p, profile, ctx.categories)
          )
        : [];
      const gu = ctx.regions.find((r) => r.region_code === profile?.region_code && r.region_level === 'GU');
      const rows = planNotifications({
        settings,
        matched,
        newPolicies: open,
        newEvents,
        myPlaces: gu ? places.filter((p) => p.region_code === gu.region_code) : [],
        guName: gu?.region_name ?? '',
      });
      if (!rows.length) { result.skipped++; continue; }

      // 이미 보낸 소식은 건너뛴다 (같은 정책·시설 id 가 같은 종류 알림에 들어 있으면 보낸 것으로 본다)
      const sentRows = checked(
        await supabase.from('notification').select('type, policy_id, link').eq('user_id', userId).gte('created_at', since)
      );
      const sent = (r) => sentRows.some((s) => s.type === r.type && (r.type === 'FACILITY' ? s.link === r.link : r.ids.includes(s.policy_id)));
      for (const row of rows.filter((r) => !sent(r))) {
        if (dryRun) {
          result.sent++;
          (result.preview ??= []).push(`${userId.slice(0, 6)} ${row.type} ${row.title} | ${row.body}`);
          continue;
        }
        const { ids, ...insert } = row;
        const { error } = await supabase.from('notification').insert({ user_id: userId, ...insert });
        if (error) {
          result.failed++;
          if (!typeWarned && /check constraint/i.test(error.message)) {
            typeWarned = true;
            console.warn('[새 소식 알림] notification.type 에 새 종류가 아직 없어요. migrations/20261122_notification_types.sql 을 실행해 주세요');
          }
        } else result.sent++;
      }
    } catch (e) {
      result.failed++;
      console.error('[새 소식 알림] 사용자 처리 실패:', e.message);
    }
  }
  return result;
}
