// 캘린더 (SRS FR-C01~C14): 찜·신청 준비 정책의 일정과 정책별 알림
import * as repo from '../repositories/calendar.repository.js';
import { buildDocuments, officialDocuments } from './documents.js';
import { AppError } from '../utils/response.js';
import {reconcileStoredResults} from './application-results.service.js';
import {
  DEFAULT_DAY_TIME,
  MAX_CUSTOM_ALARMS,
  PRESETS,
  PRESET_CODES,
  assertValidFireAt,
  deadlineAt,
  presetFireAt,
  todayKst,
} from './alarmTime.js';

// 캘린더 화면 전체 데이터: 목록용 항목 + 달력 점으로 그릴 일정(마감·신청 완료·결과 발표)
export async function getCalendar(userId) {
  await reconcileStoredResults(userId);
  const [bookmarks, applications] = await Promise.all([
    repo.findBookmarks(userId),
    repo.findApplications(userId),
  ]);

  const byPolicy = new Map(); // policy_id → 항목
  const ensure = (policy) => {
    if (!policy) return null;
    if (!byPolicy.has(policy.policy_id)) {
      byPolicy.set(policy.policy_id, {
        policy_id: policy.policy_id,
        title: policy.title,
        category_id: policy.category_id,
        application_end_date: policy.application_end_date,
        is_always_open: policy.is_always_open,
        policy,
        bookmarked: false,
        bookmark_id: null,
        stage: null,
        applied_at: null,
        expected_result_date: null,
      });
    }
    return byPolicy.get(policy.policy_id);
  };
  for (const b of bookmarks) {
    const item = ensure(b.policy);
    if (item) Object.assign(item, { bookmarked: true, bookmark_id: b.bookmark_id });
  }
  for (const a of applications) {
    const item = ensure(a.policy);
    if (item)
      Object.assign(item, {
        stage: a.stage,
        applied_at: a.applied_at,
        // '미정'으로 저장된 결과 발표일은 비어 있으므로 표시하지 않는다 (FR-C14)
        expected_result_date: a.expected_result_date ?? null,
      });
  }

  const items = [...byPolicy.values()];
  const ids = items.map((i) => i.policy_id);
  const bookmarkIds = items.map((i) => i.bookmark_id).filter(Boolean);
  const [statuses, regions, alarms, docRows] = await Promise.all([
    repo.findStatuses(ids),
    repo.findRegionNames(ids),
    repo.findAlarmsByBookmarks(bookmarkIds),
    repo.findDocumentRows(userId),
  ]);

  for (const item of items) {
    const st = statuses.find((s) => s.policy_id === item.policy_id);
    item.recruitment_status = st?.recruitment_status ?? null;
    item.d_day = st?.d_day ?? null;
    item.region_names = regions
      .filter((r) => r.policy_id === item.policy_id)
      .map((r) => r.region?.region_name)
      .filter(Boolean);
    // 준비물 체크리스트: 정책 상세의 공식 준비물 + 마이에서 직접 추가한 준비물
    item.documents = buildDocuments(
      item.policy,
      docRows.filter((r) => r.policy_id === item.policy_id)
    );
    item.docs_total = item.documents.length;
    item.docs_checked = item.documents.filter((d) => d.checked).length;
    delete item.policy;
    item.alarms = alarms
      .filter((a) => a.bookmark_id === item.bookmark_id)
      .map(({ alarm_id, kind, preset_code, fire_at, repeat_daily }) => ({
        alarm_id,
        kind,
        preset_code,
        fire_at,
        repeat_daily,
      }));
  }

  // 달력 점. 같은 신청 건의 일정은 한 번만 만든다 (FR-C14)
  const events = [];
  for (const item of items) {
    const listed = item.bookmarked || item.stage === 'PREPARING';
    if (listed && item.application_end_date && !item.is_always_open)
      events.push({ type: 'DEADLINE', date: item.application_end_date, policy_id: item.policy_id });
    if ((item.stage === 'APPLIED' || item.stage === 'RESULT') && item.applied_at)
      events.push({ type: 'APPLIED', date: item.applied_at, policy_id: item.policy_id });
    if (item.stage && item.expected_result_date)
      events.push({ type: 'RESULT', date: item.expected_result_date, policy_id: item.policy_id });
  }

  return { today: todayKst(), items, events };
}

async function loadBookmarkOrThrow(userId, policyId) {
  const bookmark = await repo.findBookmarkOf(userId, policyId);
  if (!bookmark)
    throw new AppError(404, 'BOOKMARK_NOT_FOUND', '찜한 정책에만 알림을 설정할 수 있어요.');
  return bookmark;
}

// 알림 설정 시트용: 설정된 알림, 빠른 추가 칩(지난 시각은 disabled), 직접 정하기 범위
export async function getAlarmInfo(userId, policyId) {
  const bookmark = await loadBookmarkOrThrow(userId, policyId);
  const pref = await repo.findPreference(userId);
  const dayTime = String(pref?.day_alarm_time ?? DEFAULT_DAY_TIME).slice(0, 5);
  const defaults = pref?.default_presets ?? ['D1', 'M30'];
  const policy = bookmark.policy;
  const deadline = deadlineAt(policy.is_always_open ? null : policy.application_end_date);
  const now = new Date();

  const alarms = await repo.findAlarmsByBookmarks([bookmark.bookmark_id]);
  const presets = deadline
    ? PRESETS.map((p) => {
        const fireAt = presetFireAt(p.code, policy.application_end_date, dayTime);
        return {
          code: p.code,
          label: p.code === 'DDAY_AM' ? `당일 오전 ${Number(dayTime.slice(0, 2))}시` : p.label,
          fire_at: fireAt.toISOString(),
          past: fireAt.getTime() <= now.getTime(),
          is_default: defaults.includes(p.code),
        };
      })
    : [];

  return {
    policy: {
      policy_id: policy.policy_id,
      title: policy.title,
      application_end_date: policy.application_end_date,
      deadline_at: deadline ? deadline.toISOString() : null,
      docs_total: officialDocuments(policy).length,
    },
    now: now.toISOString(),
    day_alarm_time: dayTime,
    default_presets: defaults,
    alarms: alarms.map(({ alarm_id, kind, preset_code, fire_at, repeat_daily }) => ({
      alarm_id,
      kind,
      preset_code,
      fire_at,
      repeat_daily,
    })),
    presets,
  };
}

// 알림 저장: 선택한 프리셋 + 직접 정한 시각을 통째로 바꾼다. 서버에서 시각을 다시 검증한다 (FR-C10, FR-C13)
export async function saveAlarms(userId, policyId, body = {}) {
  const bookmark = await loadBookmarkOrThrow(userId, policyId);
  const policy = bookmark.policy;
  if (policy.is_always_open || !policy.application_end_date)
    throw new AppError(400, 'NO_DEADLINE', '마감일이 없는 정책은 알림을 만들 수 없어요.');

  const pref = await repo.findPreference(userId);
  const dayTime = String(pref?.day_alarm_time ?? DEFAULT_DAY_TIME).slice(0, 5);
  const now = new Date();
  const presets = [...new Set(Array.isArray(body.presets) ? body.presets : [])];
  const customs = Array.isArray(body.customs) ? body.customs : [];
  if (customs.length > MAX_CUSTOM_ALARMS)
    throw new AppError(
      400,
      'TOO_MANY_ALARMS',
      `직접 정한 알림은 ${MAX_CUSTOM_ALARMS}개까지 만들 수 있어요.`
    );

  const rows = [];
  for (const code of presets) {
    if (!PRESET_CODES.includes(code))
      throw new AppError(400, 'INVALID_PRESET', '알 수 없는 알림 종류예요.');
    const fireAt = presetFireAt(code, policy.application_end_date, dayTime);
    assertValidFireAt(fireAt, policy.application_end_date, now);
    rows.push({
      bookmark_id: bookmark.bookmark_id,
      kind: 'PRESET',
      preset_code: code,
      fire_at: fireAt.toISOString(),
      repeat_daily: false,
    });
  }
  const seen = new Set();
  for (const c of customs) {
    const fireAt = new Date(c?.fire_at);
    assertValidFireAt(fireAt, policy.application_end_date, now);
    const key = fireAt.toISOString();
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      bookmark_id: bookmark.bookmark_id,
      kind: 'CUSTOM',
      preset_code: null,
      fire_at: key,
      repeat_daily: Boolean(c.repeat_daily),
    });
  }

  await repo.replaceAlarms(bookmark.bookmark_id, rows);
  return getAlarmInfo(userId, policyId);
}

export async function removeAlarm(userId, alarmId) {
  const row = await repo.findAlarmWithOwner(alarmId);
  if (!row || row.bookmark?.user_id !== userId)
    throw new AppError(404, 'ALARM_NOT_FOUND', '알림을 찾을 수 없어요.');
  await repo.deleteAlarm(alarmId);
}

// 찜할 때 기본 알림(기본값 1일 전·30분 전)을 넣는다. 지난 시각·마감일 없는 정책은 건너뛴다 (FR-A15, FR-H12)
export async function createDefaultAlarms(userId, policyId) {
  const bookmark = await repo.findBookmarkOf(userId, policyId);
  const policy = bookmark?.policy;
  if (!policy || policy.is_always_open || !policy.application_end_date) return 0;
  const pref = await repo.findPreference(userId);
  if (pref && pref.deadline_enabled === false) return 0;
  const dayTime = String(pref?.day_alarm_time ?? DEFAULT_DAY_TIME).slice(0, 5);
  const now = Date.now();
  const rows = (pref?.default_presets ?? ['D1', 'M30'])
    .map((code) => ({ code, at: presetFireAt(code, policy.application_end_date, dayTime) }))
    .filter((x) => x.at && x.at.getTime() > now)
    .map((x) => ({
      bookmark_id: bookmark.bookmark_id,
      kind: 'PRESET',
      preset_code: x.code,
      fire_at: x.at.toISOString(),
      repeat_daily: false,
    }));
  await repo.insertPresetAlarmsIfMissing(rows);
  return rows.length;
}
