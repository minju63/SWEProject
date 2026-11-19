import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { AppError } from '../utils/response.js';

// Single API process only. No new database tables or SQL installation is required.
// Auth owns passwords and OTPs; this journal contains only workflow/consent records.
const defaultPath = fileURLToPath(new URL('../../../.local/account-state.json', import.meta.url));
export function createFileRegistrationState({ path = defaultPath, now = Date.now } = {}) {
  let queue = Promise.resolve();
  const deny = (code) => {
    throw new AppError(
      ['COOLDOWN', 'ATTEMPTS', 'RATE_LIMIT'].includes(code) ? 429 : 409,
      code,
      {
        COOLDOWN: '인증번호는 마지막 요청 60초 후 다시 보낼 수 있어요.',
        ATTEMPTS: '인증번호를 5회 틀렸어요. 다시 발송해주세요.',
        EXPIRED: '인증번호가 만료됐어요. 다시 발송해주세요.',
        BUSY: '처리 중이에요. 잠시 후 다시 시도해주세요.',
        IDENTITY_EXISTS: '이미 사용 중인 아이디 또는 이메일이에요.',
        NOT_VERIFIED: '이메일 인증을 완료해주세요.',
        INVALID_CHALLENGE: '요청을 다시 시작해주세요.',
        STALE_OPERATION: '요청이 만료됐어요. 다시 시도해주세요.',
        USER_MISMATCH: '해당 계정의 요청이 아니에요.',
      }[code] || '요청을 다시 확인해주세요.'
    );
  };
  async function transaction(action, id, input) {
    let db;
    try {
      db = JSON.parse(await readFile(path, 'utf8'));
    } catch (e) {
      if (e.code !== 'ENOENT')
        throw new AppError(
          503,
          'AUTH_STATE',
          '계정 처리 기록을 읽지 못했어요. 관리자에게 문의해주세요.'
        );
      db = { requests: {}, deletions: {}, rates: {}, recovery: {} };
    }
    db.recovery ||= {};
    const n = now();
    const requests = Object.values(db.requests);
    const reservedIdentity = (kind, value, exceptId) =>
      Object.entries(db.recovery).some(
        ([key, row]) =>
          key !== exceptId &&
          row.reservedKind === kind &&
          row.reservedValue === value &&
          (row.status === 'applying' || (row.status !== 'consumed' && row.expiresAt > n))
      );
    let r = db.requests[id],
      result;
    const lease = (row) => {
      if (row.operation_until && Date.parse(row.operation_until) > n) deny('BUSY');
      row.operation_id = randomUUID();
      row.operation_until = new Date(n + 120000).toISOString();
      return row;
    };
    const match = (row) => {
      if (!row || row.operation_id !== input.operationId || Date.parse(row.operation_until) <= n)
        deny('STALE_OPERATION');
    };
    const unlock = (row) => {
      row.operation_id = null;
      row.operation_until = null;
    };
    const job = (userId, requestId, reason) => {
      let j = Object.values(db.deletions).find((j) =>
        userId ? j.user_id === userId : j.request_id === requestId
      );
      if (!j) {
        j = {
          id: randomUUID(),
          user_id: userId,
          request_id: requestId,
          reason,
          next_attempt_at: new Date(n).toISOString(),
          attempts: 0,
        };
        db.deletions[j.id] = j;
      }
      return j;
    };
    if (action === 'health') result = { version: 2, driver: 'file' };
    else if (action === 'rate') {
      for (const [key, value] of Object.entries(db.rates))
        if (value.until <= n) delete db.rates[key];
      const rate = db.rates[input.key] || { count: 0, until: n + 60000 };
      rate.count = Math.min(rate.count + 1, 41);
      db.rates[input.key] = rate;
      result = { allowed: rate.count <= 40, retryAt: rate.until };
    } else if (action === 'available')
      result = {
        available:
          !requests.some((r) => r[input.kind] === input.value) &&
          !reservedIdentity(input.kind, input.value),
      };
    else if (action === 'lookup')
      result =
        requests.find((r) => r.username === input.username && r.status === 'completed') || null;
    else if (action === 'access')
      result = {
        allowed:
          !Object.values(db.deletions).some((j) => j.user_id === input.userId) &&
          !requests.some((r) => r.user_id === input.userId && r.status !== 'completed'),
      };
    else if (action === 'reserve') {
      if (
        requests.some((r) => r.username === input.username || r.email === input.email) ||
        reservedIdentity('username', input.username) ||
        reservedIdentity('email', input.email)
      )
        deny('IDENTITY_EXISTS');
      result = db.requests[id] = lease({
        id,
        username: input.username,
        email: input.email,
        nickname: input.nickname,
        consents: input.consents,
        status: 'creating',
        created_at: new Date(n).toISOString(),
        expires_at: new Date(n + 86400000).toISOString(),
        attempts: 0,
        generation: 0,
      });
    } else if (action === 'queue_withdrawal') {
      r = requests.find((r) => r.user_id === input.userId);
      if (r) {
        lease(r);
        r.status = 'cleanup';
        unlock(r);
      }
      result = job(input.userId, r?.id || null, 'withdrawal');
    } else if (action === 'enqueue_expired') {
      for (const r of requests)
        if (
          !['completed', 'cleanup'].includes(r.status) &&
          Date.parse(r.expires_at) <= n &&
          !(Date.parse(r.operation_until) > n)
        ) {
          r.status = 'cleanup';
          unlock(r);
          job(r.user_id || null, r.id, 'abandoned');
        }
      result = {};
    } else if (action === 'claim_cleanup') {
      const j = Object.values(db.deletions).find(
        (j) =>
          (!id || j.id === id) &&
          (!input.reason || j.reason === input.reason) &&
          Date.parse(j.next_attempt_at) <= n &&
          !(Date.parse(j.operation_until) > n)
      );
      if (j) {
        lease(j);
        j.attempts++;
        result = { ...j, request: db.requests[j.request_id] || null };
      } else result = null;
    } else if (['renew_cleanup', 'ack_cleanup', 'fail_cleanup'].includes(action)) {
      const j = db.deletions[id];
      match(j);
      if (action === 'renew_cleanup') j.operation_until = new Date(n + 120000).toISOString();
      else if (action === 'ack_cleanup') {
        const userId = j.user_id || input.userId;
        if (userId) {
          for (const [key, r] of Object.entries(db.requests))
            if (r.user_id === userId) delete db.requests[key];
          for (const [key, r] of Object.entries(db.recovery))
            if (r.userId === userId || key === 'cooldown:' + userId) delete db.recovery[key];
        }
        delete db.requests[j.request_id];
        delete db.deletions[id];
      } else {
        unlock(j);
        j.next_attempt_at = new Date(
          n + Math.min(3600000, 30000 * 2 ** Math.min(j.attempts, 7))
        ).toISOString();
      }
      result = {};
    } else if (action === 'identity_active') {
      const active = Object.entries(db.recovery).find(
        ([, r]) => r.userId === input.userId && r.status === 'applying'
      );
      result = active ? { requestId: active[0], kind: active[1].kind } : null;
    } else if (action === 'identity_reserve') {
      const record = db.recovery[id];
      if (
        !record ||
        record.userId !== input.userId ||
        record.expiresAt <= n ||
        record.status !== 'verified'
      )
        deny('INVALID_CHALLENGE');
      if (
        requests.some((r) => r.user_id !== input.userId && r[input.kind] === input.value) ||
        reservedIdentity(input.kind, input.value, id)
      )
        deny('IDENTITY_EXISTS');
      record.reservedKind = input.kind;
      record.reservedValue = input.value;
      result = record;
    } else if (action === 'identity_commit') {
      const record = db.recovery[id];
      if (
        !record ||
        record.userId !== input.userId ||
        !record.reservedKind ||
        record.status !== 'applying'
      )
        deny('INVALID_CHALLENGE');
      for (const row of requests)
        if (row.user_id === input.userId) row[record.reservedKind] = record.reservedValue;
      record.status = 'consumed';
      delete record.otpHash;
      result = {};
    } else if (action === 'recovery_put') {
      db.recovery[id] = input;
      result = input;
    } else if (action === 'recovery_get') result = db.recovery[id] || null;
    else if (action === 'recovery_invalidate_user') {
      if (
        Object.values(db.recovery).some((r) => r.userId === input.userId && r.status === 'applying')
      )
        deny('BUSY');
      for (const r of Object.values(db.recovery))
        if (r.userId === input.userId) {
          r.status = 'consumed';
          delete r.grantHash;
          delete r.sessionCipher;
        }
      result = {};
    } else if (action === 'recovery_delete') {
      delete db.recovery[id];
      result = {};
    } else {
      if (!r) deny('INVALID_CHALLENGE');
      if (action === 'get') result = r;
      else if (action === 'attach') {
        match(r);
        if (r.status !== 'creating') deny('INVALID_STATE');
        r.user_id = input.userId;
        r.status = 'pending';
        unlock(r);
        result = r;
      } else if (action === 'queue_cancel') {
        if (r.status === 'completed') deny('ALREADY_COMPLETED');
        lease(r);
        r.status = 'cleanup';
        unlock(r);
        result = job(r.user_id || null, r.id, 'cancel');
      } else if (action.startsWith('finish_')) {
        match(r);
        if (action === 'finish_send' && r.status === 'sending') {
          r.status = 'pending';
          if (input.success) {
            r.sent_at = new Date(n).toISOString();
            r.otp_expires_at = new Date(n + 300000).toISOString();
            r.attempts = 0;
            r.generation++;
          }
        } else if (action === 'finish_verify' && r.status === 'verifying') {
          if (input.success && input.userId !== r.user_id) deny('USER_MISMATCH');
          r.status = input.success ? 'verified' : 'pending';
          if (input.success) r.verified_at = n;
        } else if (action === 'finish_complete' && r.status === 'completing')
          r.status = input.success ? 'completed' : 'verified';
        else deny('INVALID_STATE');
        unlock(r);
        result = r;
      } else {
        if (r.status === 'cleanup' || (r.status !== 'completed' && Date.parse(r.expires_at) <= n))
          deny('EXPIRED_REQUEST');
        if (Date.parse(r.operation_until) > n) deny('BUSY');
        if (['sending', 'verifying'].includes(r.status)) r.status = 'pending';
        if (r.status === 'completing') r.status = 'verified';
        if (action === 'begin_send') {
          if (r.status !== 'pending') deny('INVALID_STATE');
          if (Date.parse(r.last_send_attempt_at) > n - 60000) deny('COOLDOWN');
          r.last_send_attempt_at = new Date(n).toISOString();
          r.status = 'sending';
          lease(r);
        } else if (action === 'begin_verify') {
          if (r.status !== 'pending') deny('INVALID_STATE');
          if (!r.otp_expires_at || Date.parse(r.otp_expires_at) <= n) deny('EXPIRED');
          if (r.attempts >= 5) deny('ATTEMPTS');
          r.attempts++;
          r.status = 'verifying';
          lease(r);
        } else if (action === 'begin_complete') {
          if (r.user_id !== input.userId) deny('USER_MISMATCH');
          if (r.status !== 'completed') {
            if (r.status !== 'verified') deny('NOT_VERIFIED');
            if (r.verified_at + 300000 <= n) deny('EXPIRED');
            r.status = 'completing';
            lease(r);
          }
        } else deny('INVALID_ACTION');
        result = r;
      }
    }
    // Remove stale recovery workflows; keep account/consent records until cancellation/deletion.
    for (const [key, value] of Object.entries(db.recovery))
      if (value.status !== 'applying' && value.expiresAt < n - 86400000) delete db.recovery[key];
    await mkdir(dirname(path), { recursive: true });
    const temp = resolve(dirname(path), `.auth-${randomUUID()}.tmp`);
    await writeFile(temp, JSON.stringify(db), { mode: 0o600 });
    await rename(temp, path);
    return structuredClone(result);
  }
  return {
    command(action, id = null, input = {}) {
      const pending = queue.then(() => transaction(action, id, input));
      queue = pending.catch(() => {});
      return pending;
    },
  };
}
