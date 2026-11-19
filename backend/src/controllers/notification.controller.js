import * as repo from '../repositories/notification.repository.js';
import * as prefs from '../repositories/alarmPreference.repository.js';
import { ok, AppError } from '../utils/response.js';

export async function list(req, res) {
  ok(res, await repo.findRecent(req.user.id));
}

export async function unreadCount(req, res) {
  ok(res, { unread: await repo.countUnread(req.user.id) });
}

export async function read(req, res) {
  await repo.markRead(req.user.id, req.params.notificationId);
  ok(res, null);
}

export async function readAll(req, res) {
  await repo.markAllRead(req.user.id);
  ok(res, null);
}

// 마이 › 알림 설정 (FR-MY-009, FR-MY-012~016)
export async function getPreferences(req, res) {
  ok(res, await prefs.find(req.user.id));
}

export async function putPreferences(req, res) {
  const body = req.body ?? {};
  const changes = {};
  for (const key of prefs.BOOLEAN_FIELDS) {
    if (body[key] === undefined) continue;
    if (typeof body[key] !== 'boolean')
      throw new AppError(400, 'INVALID_PREFERENCE', `${key} 는 true/false 값이어야 합니다.`);
    changes[key] = body[key];
  }
  if (Object.keys(changes).length === 0)
    throw new AppError(400, 'NO_PREFERENCE', '바꿀 알림 설정이 없습니다.');
  try {
    ok(res, await prefs.save(req.user.id, changes));
  } catch (e) {
    // 새 컬럼이 아직 DB에 없을 때 (migrations/20261119_alarm_preference_settings.sql 실행 전)
    if (/column|schema cache/i.test(e.message ?? ''))
      throw new AppError(
        503,
        'MIGRATION_REQUIRED',
        '알림 설정 저장을 쓰려면 DB 마이그레이션(20261119_alarm_preference_settings.sql)을 먼저 실행해야 합니다.'
      );
    throw e;
  }
}
