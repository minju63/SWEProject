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
    if (!localStorage.getItem('sb-flkoszigqobfkztbvsyw-auth-token'))
      localStorage.setItem('sb-flkoszigqobfkztbvsyw-auth-token', JSON.stringify(session));
  }, session);
  await page.route('**/auth/v1/**', (r) => {
    if (r.request().method() === 'PUT')
      Object.assign(user.user_metadata, r.request().postDataJSON().data);
    return r.fulfill({ json: r.request().url().includes('/token') ? session : user });
  });
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
  const savedPlaces = [];
  let failPlaceSave = false;
  const profile = { user_id: user.id, interest_categories: [], special_targets: [] };
  let failSave = false;
  await page.route('**/api/v1/**', async (r) => {
    const req = r.request(),
      path = new URL(req.url()).pathname,
      body = req.postDataJSON();
    calls.push({ path, body, method: req.method() });
    let data = {};
    if (path.endsWith('/map-profile'))
      data = { user_id: user.id, region_code: profile.region_code ?? null };
    if (path.endsWith('/places'))
      data = {
        items: [
          {
            place_id: '55555555-5555-4555-8555-555555555555',
            name: 'DB 연결 장소',
            region_code: '26380',
            district: '사하구',
            lat: 35.1,
            lng: 128.97,
            category_code: 'library',
            category_name: '도서관',
            coord_status: 'verified',
          },
        ],
        categories: [{ category_code: 'library', category_name: '도서관', sort_order: 1 }],
        sync: {},
      };
    if (path.includes('/places/') && path.endsWith('/saved')) {
      const id = path.split('/').at(-2);
      if (req.method() !== 'GET' && failPlaceSave)
        return r.fulfill({ status: 503, json: { success: false, message: '저장 실패' } });
      if (req.method() === 'PUT' && !savedPlaces.includes(id)) savedPlaces.push(id);
      if (req.method() === 'DELETE') savedPlaces.splice(savedPlaces.indexOf(id), 1);
      data = { placeIds: savedPlaces };
    }
    if (/\/account\/(username|email)\//.test(path)) {
      const kind = path.split('/').at(-2),
        step = path.split('/').pop();
      data =
        step === 'verify'
          ? { grant: 'identity-fixture-grant', expiresAt: Date.now() + 300000 }
          : {
              requestId: '44444444-4444-4444-8444-444444444444',
              email: user.email,
              expiresAt: Date.now() + 300000,
              resendAt: Date.now() + 60000,
            };
      if (step === 'complete') {
        if (body.newValue === 'takenuser1')
          return r.fulfill({
            status: 409,
            json: { success: false, message: '이미 사용 중인 아이디예요.' },
          });
        if (kind === 'username') user.app_metadata.registration.username = body.newValue;
        else user.email = body.newValue;
        data = { changed: true, user_id: user.id };
      }
    }
    if (path.endsWith('/policy-catalog')) data = { policies: [], events: [], totalCount: 0 };
    if (path.endsWith('/workspace'))
      data = {
        profile,
        bookmarks: [],
        recent: [],
        applications: [],
        manual: [],
        documents: [],
        tasks: [],
      };
    if (path.endsWith('/profile')) {
      if (req.method() === 'PUT') Object.assign(profile, body);
      data = profile;
    }
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
    user,
    savedPlaces,
    setFailPlaceSave: (value) => {
      failPlaceSave = value;
    },
    profile,
    settings,
    items,
    calls,
    setFailSave: (value) => {
      failSave = value;
    },
  };
}

test('account settings opens username and email changes; failed save keeps previous identity', async ({
  page,
}) => {
  const f = await fixture(page);
  await page.goto('/settings?view=account');
  await page.getByRole('button', { name: '아이디 변경', exact: true }).click();
  await expect(page.getByRole('heading', { name: '아이디 변경', exact: true })).toBeVisible();
  await expect(page.getByLabel('등록 이메일', { exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '인증번호 받기', exact: true }).click();
  await page.getByLabel('인증번호', { exact: true }).fill('123456');
  await page.getByRole('button', { name: '인증번호 확인', exact: true }).click();
  await page.getByLabel('새 아이디', { exact: true }).fill('takenuser1');
  await page.getByRole('button', { name: '아이디 변경 저장', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('이미 사용 중인 아이디예요.');
  expect(f.user.app_metadata.registration.username).toBe('member123');
  await page.getByLabel('새 아이디', { exact: true }).fill('NEWMEMBER1');
  await page.getByRole('button', { name: '아이디 변경 저장', exact: true }).click();
  await expect(page.getByText('아이디가 변경됐어요.', { exact: true })).toBeVisible();
  expect(f.user.id).toBe('11111111-1111-4111-8111-111111111111');
  await page.getByRole('link', { name: '계정 설정으로', exact: true }).click();
  await expect(page.getByText('newmember1', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '이메일 변경', exact: true }).click();
  await page.getByRole('button', { name: '인증번호 받기', exact: true }).click();
  await page.getByLabel('인증번호', { exact: true }).fill('123456');
  await page.getByRole('button', { name: '인증번호 확인', exact: true }).click();
  await page.getByLabel('새 이메일', { exact: true }).fill('new@example.com');
  await page.getByRole('button', { name: '새 이메일 인증번호 받기', exact: true }).click();
  expect(f.user.email).toBe('member@example.com');
  await expect(page.getByLabel('새 이메일', { exact: true })).toBeDisabled();
  await page.getByLabel('새 이메일 인증번호', { exact: true }).fill('654321');
  await page.getByRole('button', { name: '이메일 변경 저장', exact: true }).click();
  await expect(page.getByText('이메일이 변경됐어요.', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: '계정 설정으로', exact: true }).click();
  await expect(page.getByText('new@example.com', { exact: true })).toBeVisible();
  expect(f.calls.filter((c) => c.path.endsWith('/account/email/complete'))).toHaveLength(1);
});

test('live map route uses minimal profile and persists place bookmarks across reload; failures roll back', async ({
  page,
}) => {
  const f = await fixture(page);
  await page.route('https://dapi.kakao.com/**', (r) => r.abort());
  await page.goto('/map');
  const save = page.getByRole('button', { name: 'DB 연결 장소 찜하기', exact: true });
  await expect(save).toBeVisible();
  await expect.poll(() => f.calls.some((c) => c.path.endsWith('/map-profile'))).toBe(true);
  await save.click();
  await expect.poll(() => f.savedPlaces.length).toBe(1);
  await page.reload();
  const remove = page.getByRole('button', { name: 'DB 연결 장소 찜 해제', exact: true });
  await expect(remove).toBeVisible();
  f.setFailPlaceSave(true);
  await remove.click();
  await expect(
    page.getByText('찜을 저장하지 못했어요. 다시 시도해 주세요', { exact: true })
  ).toBeVisible();
  await expect(remove).toBeVisible();
  expect(f.savedPlaces).toHaveLength(1);
  f.setFailPlaceSave(false);
  await remove.click();
  await expect(save).toBeVisible();
  expect(f.savedPlaces).toHaveLength(0);
  expect(f.calls.some((c) => c.path.endsWith('/me/profile'))).toBe(false);
  await expect(page.getByRole('link', { name: /마이/ })).toBeVisible();
});

test('FR-MY-001 sensitive optional selections persist and can be cleared', async ({ page }) => {
  const f = await fixture(page);
  await page.goto('/settings?view=profile');
  await page.getByLabel('닉네임', { exact: true }).fill('테스트회원');
  const married = page
    .getByRole('group', { name: '혼인 상태', exact: true })
    .getByRole('button', { name: '기혼', exact: true });
  const special = page
    .getByRole('group', { name: '특화대상', exact: true })
    .getByRole('button', { name: '장애인', exact: true });
  await married.click();
  await special.click();
  await page.getByRole('button', { name: '변경사항 저장', exact: true }).click();
  await expect(page.getByText('프로필과 맞춤정보를 저장했어요.', { exact: true })).toBeVisible();
  expect(f.profile.marital_status).toBe('기혼');
  expect(f.profile.special_targets).toEqual(['장애인']);
  await page.goto('/settings?view=profile');
  await expect(married).toHaveAttribute('aria-pressed', 'true');
  await expect(special).toHaveAttribute('aria-pressed', 'true');
  await married.click();
  await special.click();
  await page.getByRole('button', { name: '변경사항 저장', exact: true }).click();
  await expect(page.getByText('프로필과 맞춤정보를 저장했어요.', { exact: true })).toBeVisible();
  expect(f.profile.marital_status).toBeNull();
  expect(f.profile.special_targets).toEqual([]);
  await page.goto('/settings?view=profile');
  await expect(married).toHaveAttribute('aria-pressed', 'false');
  await expect(special).toHaveAttribute('aria-pressed', 'false');
});

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

test('account withdrawal shows data loss and requires a checkbox before submitting', async ({
  page,
}) => {
  const f = await fixture(page);
  await page.goto('/settings?view=account');
  await expect(page.getByText('member123', { exact: true })).toBeVisible();
  await expect(page.getByText('member@example.com', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '회원 탈퇴', exact: true }).click();
  await expect(page.getByText(/탈퇴하면 삭제된 정보는 다시 복구할 수 없어요/)).toBeVisible();
  const submit = page.getByRole('button', { name: '회원 탈퇴 계속하기', exact: true });
  await expect(submit).toBeDisabled();
  expect(f.calls.some((c) => c.method === 'DELETE')).toBe(false);
  await page.getByRole('checkbox').check();
  await submit.click();
  await expect(page).toHaveURL(/\/login\?deletion=complete$/);
  const deletion = f.calls.find((c) => c.method === 'DELETE');
  expect(deletion.body).toEqual({ confirmation: '탈퇴' });
});
