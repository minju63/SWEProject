import * as calendar from '../services/calendar.service.js';
import { ok } from '../utils/response.js';

export async function getCalendar(req, res) {
  ok(res, await calendar.getCalendar(req.user.id));
}

export async function getAlarms(req, res) {
  ok(res, await calendar.getAlarmInfo(req.user.id, req.params.policyId));
}

export async function putAlarms(req, res) {
  ok(res, await calendar.saveAlarms(req.user.id, req.params.policyId, req.body));
}

export async function deleteAlarm(req, res) {
  await calendar.removeAlarm(req.user.id, req.params.alarmId);
  ok(res, null);
}
