import { test, expect } from '@playwright/test';
test.beforeEach(async ({ page }) => {
  await page.route('**/auth/v1/**', (r) =>
    r.fulfill({ status: 401, json: { message: 'not signed in' } })
  );
  await page.route('**/rest/v1/**', (r) => r.fulfill({ json: [] }));
  await page.route('**/api/v1/**', (r) =>
    r.fulfill({ status: 401, json: { success: false, message: '로그인이 필요합니다.' } })
  );
});
test('anonymous users are redirected before protected tabs fetch data', async ({ page }) => {
  const calls = [];
  page.on('request', (r) => {
    if (r.url().includes('/api/v1/')) calls.push(r.url());
  });
  for (const path of ['/', '/map', '/my', '/calendar', '/search', '/settings']) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('dialog')).toBeVisible();
  }
  expect(calls).toEqual([]);
});
test('login links open recovery and password is visible only while pressed', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('아이디 또는 이메일').fill('MEMBER123');
  await expect(page.getByLabel('아이디 또는 이메일')).toHaveValue('member123');
  const password = page.getByLabel('비밀번호', { exact: true });
  await password.fill('test123!');
  const eye = page.getByRole('button', { name: '비밀번호 보기', exact: true });
  await eye.hover();
  await page.mouse.down();
  await expect(password).toHaveAttribute('type', 'text');
  await page.mouse.up();
  await expect(password).toHaveAttribute('type', 'password');
  await page.getByRole('link', { name: '아이디 찾기', exact: true }).click();
  await expect(page).toHaveURL(/\/find-username$/);
});
test('unregistered email can prefill signup without bypassing email checks', async ({ page }) => {
  await page.route('**/api/v1/auth/find-username', (r) =>
    r.fulfill({ json: { success: true, data: { registered: false, email: 'absent@example.com' } } })
  );
  await page.goto('/find-username');
  await page.getByLabel('가입 이메일').fill('absent@example.com');
  await page.getByRole('button', { name: '아이디 안내 메일 받기' }).click();
  await expect(page.getByRole('alert')).toContainText('가입되지 않은 이메일입니다.');
  await page.getByRole('link', { name: '회원가입', exact: true }).click();
  await expect(page.getByLabel('이메일', { exact: true })).toHaveValue('absent@example.com');
  await expect(page.getByRole('button', { name: '이메일 중복 확인', exact: true })).toBeVisible();
  await expect(page.getByText('이메일 중복 확인 완료')).toHaveCount(0);
});
test('ID success never displays username and reset runs all verification steps', async ({
  page,
}) => {
  await page.route('**/api/v1/auth/find-username', (r) =>
    r.fulfill({
      json: {
        success: true,
        data: { registered: true, message: '가입 이메일로 아이디 안내 메일을 보냈어요.' },
      },
    })
  );
  await page.goto('/find-username');
  await page.getByLabel('가입 이메일').fill('member@example.com');
  await page.getByRole('button', { name: '아이디 안내 메일 받기' }).click();
  await expect(page.getByRole('status')).toContainText('메일을 보냈어요');
  await expect(page.getByText('member123', { exact: true })).toHaveCount(0);
  const requests = [];
  await page.route('**/api/v1/auth/password-reset/*', (r) => {
    const step = r.request().url().split('/').pop(),
      body = r.request().postDataJSON();
    requests.push({ step, body });
    const data =
      step === 'start'
        ? {
            requestId: '22222222-2222-4222-8222-222222222222',
            email: 'member@example.com',
            expiresAt: Date.now() + 300000,
            resendAt: Date.now() + 60000,
          }
        : step === 'verify'
          ? { grant: 'one-use-reset-grant', expiresAt: Date.now() + 300000 }
          : { message: 'changed' };
    return r.fulfill({ json: { success: true, data } });
  });
  await page.goto('/reset-password');
  await page.getByLabel('아이디', { exact: true }).fill('MEMBER123');
  await page.getByLabel('가입 이메일').fill('member@example.com');
  await page.getByRole('button', { name: '인증번호 받기', exact: true }).click();
  await expect(page.getByRole('button', { name: /초 후 다시 발송/ })).toBeDisabled();
  await page.getByLabel('인증번호', { exact: true }).fill('123456');
  await page.getByRole('button', { name: '인증번호 확인', exact: true }).click();
  await page.getByLabel('새 비밀번호', { exact: true }).fill('newpass1!');
  await page.getByLabel('새 비밀번호 확인', { exact: true }).fill('different');
  await page.getByRole('button', { name: '비밀번호 재설정', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('비밀번호가 서로 다릅니다.');
  await page.getByLabel('새 비밀번호 확인', { exact: true }).fill('newpass1!');
  await page.getByRole('button', { name: '비밀번호 재설정', exact: true }).click();
  await expect(page).toHaveURL(/\/login\?password=changed$/);
  expect(requests.map((r) => r.step)).toEqual(['start', 'verify', 'complete']);
  expect(requests[0].body.username).toBe('member123');
  expect(requests[2].body.grant).toBe('one-use-reset-grant');
  expect(
    await page.evaluate(() => JSON.stringify({ local: localStorage, session: sessionStorage }))
  ).not.toContain('one-use-reset-grant');
});
