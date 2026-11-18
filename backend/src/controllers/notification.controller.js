import * as repo from '../repositories/notification.repository.js';
import { ok } from '../utils/response.js';

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
