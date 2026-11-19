import { test, expect } from '@playwright/test';

// All Auth/API responses are local fixtures: never sends mail or modifies a real account.
async function fixture(page) {
  const user = {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'member@example.com',
    aud: 'authenticated',
    role: 'authenticated',
    user_metadata: { display_name: '민주' },
    app_metadata: { registration: { username: 'member123' } },
    created_at: new Date().toISOString(),
  };
  const token = [
    { alg: 'HS256', typ: 'JWT' },
    { sub: user.id, aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 },
    'fixture',
  ]
    .map((v) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url'))
    .join('.');
  const session = {
    access_token: token,
    refresh_token: 'fixture-refresh',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: 'bearer',
    user,
  };
  await page.addInitScript((session) => {
    localStorage.setItem('sb-flkoszigqobfkztbvsyw-auth-token', JSON.stringify(session));
  }, session);
  await page.route('**/auth/v1/**', (r) =>
    r.fulfill({ json: r.request().url().includes('/token') ? session : user })
  );
  await page.route('**/rest/v1/**', (r) => r.fulfill({ json: [] }));
  const settings = {
    enabled: true,
    recommendations: true,
    policyAlerts: false,
    eventAlerts: true,
    facilityAlerts: true,
    deadlines: true,
    applicationUpdates: true,
    deadlineTiming: '3일 전',
    quietHours: false,
  };
  const items = [
    {
      notification_id: '22222222-2222-4222-8222-222222222222',
      type: 'DEADLINE',
      title: '실제 조회 응답의 마감 알림',
      body: '마감 안내',
      group: '마감',
      is_read: false,
      created_at: new Date().toISOString(),
    },
    {
      notification_id: '33333333-3333-4333-8333-333333333333',
      type: 'NEW_MATCH',
      title: '실제 조회 응답의 맞춤 알림',
      body: '맞춤 안내',
      group: '맞춤 혜택',
      is_read: false,
      created_at: new Date().toISOString(),
    },
  ];
  const calls = [];
  let failSave = false;
  await page.route('**/api/v1/**', async (r) => {
    const req = r.request(),
      path = new URL(req.url()).pathname,
      body = req.postDataJSON();
    calls.push({ path, body, method: req.method() });
    let data = {};
    if (path.endsWith('/policy-catalog')) data = { policies: [], events: [], totalCount: 0 };
    if (path.endsWith('/workspace'))
      data = {
        profile: { nickname: '민주' },
        bookmarks: [],
        recent: [],
        applications: [],
        manual: [],
        documents: [],
        tasks: [],
      };
    if (path.endsWith('/notifications'))
      data = { items, unreadCount: items.filter((n) => !n.is_read).length };
    if (path.endsWith('/read')) {
      const id = path.split('/').at(-2);
      items
        .filter((n) => id === 'all' || n.notification_id === id)
        .forEach((n) => (n.is_read = true));
    }
    if (path.endsWith('/notification-settings')) {
      if (req.method() === 'PUT') {
        if (failSave)
          return r.fulfill({ status: 503, json: { success: false, message: '저장 실패 테스트' } });
        Object.assign(settings, body);
      }
      data = settings;
    }
    if (path.includes('/account/password/')) {
      const step = path.split('/').pop();
      data =
        step === 'start'
          ? {
              requestId: '44444444-4444-4444-8444-444444444444',
              email: user.email,
              expiresAt: Date.now() + 300000,
              resendAt: Date.now() + 60000,
            }
          : step === 'verify'
            ? { grant: 'one-use-change-grant', expiresAt: Date.now() + 300000 }
            : { message: 'changed' };
    }
    return r.fulfill({ json: { success: true, data } });
  });
  return {
    settings,
    items,
    calls,
    setFailSave: (value) => {
      failSave = value;
    },
  };
}

test('notification types use API rows and read-all persists after reload', async ({ page }) => {
  const f = await fixture(page);
  await page.goto('/notifications');
  await expect(page.getByText('실제 조회 응답의 마감 알림', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: '맞춤 혜택', exact: true }).click();
  await expect(page.getByText('실제 조회 응답의 마감 알림', { exact: true })).toHaveCount(0);
  await expect(page.getByText('실제 조회 응답의 맞춤 알림', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '모두 읽음', exact: true }).click();
  await expect(page.getByRole('button', { name: '모두 읽음', exact: true })).toBeDisabled();
  expect(f.items.every((n) => n.is_read)).toBe(true);
  await page.reload();
  await expect(page.getByText(/안 읽음/)).toHaveCount(0);
});

test('master off preserves children, persists and failed save stays on the form', async ({
  page,
}) => {
  const f = await fixture(page);
  await page.goto('/settings?view=notifications');
  const master = page.getByRole('switch', { name: '전체 알림', exact: true }),
    policy = page.getByRole('switch', { name: '정책 알림', exact: true });
  await expect(master).toBeEnabled();
  await expect(policy).not.toBeChecked();
  await master.click();
  await expect(policy).toBeDisabled();
  await page.getByRole('button', { name: '설정 저장', exact: true }).click();
  await expect(page.getByText('알림 설정을 저장했어요.', { exact: true })).toBeVisible();
  expect(f.settings.enabled).toBe(false);
  expect(f.settings.policyAlerts).toBe(false);
  expect(f.settings.deadlines).toBe(true);
  await page.goto('/settings?view=notifications');
  await expect(master).toBeEnabled();
  await expect(master).not.toBeChecked();
  await master.click();
  await expect(policy).not.toBeChecked();
  f.setFailSave(true);
  await page.getByRole('button', { name: '설정 저장', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText(
    '알림 설정을 저장하지 못했어요. 다시 시도해주세요.'
  );
  await expect(master).toBeVisible();
  expect(f.settings.enabled).toBe(false);
});

test('logged-in password change locks account identity and completes via its own endpoint', async ({
  page,
}) => {
  const f = await fixture(page);
  await page.goto('/settings/password');
  await expect(page.getByLabel('아이디', { exact: true })).toHaveValue('member123');
  await expect(page.getByLabel('아이디', { exact: true })).toBeDisabled();
  await expect(page.getByLabel('가입 이메일', { exact: true })).toHaveValue('member@example.com');
  await expect(page.getByLabel('가입 이메일', { exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '인증번호 받기', exact: true }).click();
  await page.getByLabel('인증번호', { exact: true }).fill('123456');
  await page.getByRole('button', { name: '인증번호 확인', exact: true }).click();
  await page.getByLabel('새 비밀번호', { exact: true }).fill('newpass1!');
  await page.getByLabel('새 비밀번호 확인', { exact: true }).fill('newpass1!');
  await page.getByRole('button', { name: '비밀번호 변경', exact: true }).click();
  await expect(page).toHaveURL(/\/login\?password=changed$/);
  const steps = f.calls.filter((c) => c.path.includes('/account/password/'));
  expect(steps.map((c) => c.path.split('/').pop())).toEqual(['start', 'verify', 'complete']);
  expect(steps[0].body).toEqual({});
  expect(steps[2].body.grant).toBe('one-use-change-grant');
});

test('account withdrawal shows data loss and requires a checkbox before submitting',async({page})=>{
 const f=await fixture(page);await page.goto('/settings?view=account');
 await expect(page.getByText('member123',{exact:true})).toBeVisible();
 await expect(page.getByText('member@example.com',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'회원 탈퇴',exact:true}).click();
 await expect(page.getByText(/탈퇴하면 삭제된 정보는 다시 복구할 수 없어요/)).toBeVisible();
 const submit=page.getByRole('button',{name:'회원 탈퇴 계속하기',exact:true});
 await expect(submit).toBeDisabled();expect(f.calls.some(c=>c.method==='DELETE')).toBe(false);
 await page.getByRole('checkbox').check();await submit.click();
 await expect(page).toHaveURL(/\/login\?deletion=complete$/);
 const deletion=f.calls.find(c=>c.method==='DELETE');expect(deletion.body).toEqual({confirmation:'탈퇴'});
});
