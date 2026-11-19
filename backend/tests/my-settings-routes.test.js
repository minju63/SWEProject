import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import router from '../src/routes/my-settings.routes.js';
import { supabase } from '../src/lib/supabase.js';
import { registrationState } from '../src/services/registration-state.service.js';
import { passwordChange } from '../src/services/registration-runtime.service.js';
import { errorHandler } from '../src/middlewares/error.js';

test('My settings routes require login, bind password changes to the owner and limit map profile fields', async () => {
  const id = '11111111-1111-4111-8111-111111111111';
  const original = {
    auth: supabase.auth.getUser,
    from: supabase.from,
    command: registrationState.command,
    start: passwordChange.start,
  };
  supabase.auth.getUser = async (token) =>
    token === 'valid'
      ? { data: { user: { id } } }
      : { data: { user: null }, error: { message: 'invalid' } };
  registrationState.command = async (action, _id, input) => {
    assert.equal(action, 'access');
    assert.equal(input.userId, id);
    return { allowed: true };
  };
  passwordChange.start = async (...args) => {
    assert.deepEqual(args, [null, null, id]);
    return { email: 'own@example.com' };
  };
  supabase.from = (table) => {
    assert.equal(table, 'user_profile');
    const q = {
      select(fields) {
        assert.equal(fields, 'region_code');
        return q;
      },
      eq(key, value) {
        assert.equal(key, 'user_id');
        assert.equal(value, id);
        return q;
      },
      async maybeSingle() {
        return { data: { region_code: '26380' }, error: null };
      },
    };
    return q;
  };
  const app = express();
  app.use(express.json());
  app.use('/me', router);
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    assert.equal((await fetch(base + '/me/map-profile')).status, 401);
    const map = await fetch(base + '/me/map-profile', {
      headers: { Authorization: 'Bearer valid' },
    });
    assert.deepEqual((await map.json()).data, { user_id: id, region_code: '26380' });
    const change = await fetch(base + '/me/account/password/start', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid', 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'other', email: 'other@example.com', username: 'other' }),
    });
    assert.equal(change.status, 200);
    assert.equal((await change.json()).data.email, 'own@example.com');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    supabase.auth.getUser = original.auth;
    supabase.from = original.from;
    registrationState.command = original.command;
    passwordChange.start = original.start;
  }
});
