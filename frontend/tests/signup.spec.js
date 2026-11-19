import { test, expect } from '@playwright/test';
const email = 'signup-test@example.com',
  password = 'test123!';

test.beforeEach(async ({ page }) => {
  // Every authentication and personal request is intercepted: no accounts or emails are created.
  await page.route('**/api/v1/**', (route) =>
    route.fulfill({
      json: {
        success: true,
        data: {
          policies: [],
          events: [],
          totalCount: 0,
          bookmarks: [],
          recent: [],
          applications: [],
          profile: null,
          documents: [],
          tasks: [],
        },
      },
    })
  );
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }));
  let personalization = true;
  let registrationPending = false;
  let skipped;
  const user = () => ({
    id: '11111111-1111-4111-8111-111111111111',
    email,
    aud: 'authenticated',
    role: 'authenticated',
    user_metadata: { display_name: '새회원' },
    app_metadata: {
      registration_pending: registrationPending,
      registration: { consents: { personalization }, onboardingCompleted: skipped !== undefined },
    },
    created_at: new Date().toISOString(),
  });
  const jwt = [
    { alg: 'HS256', typ: 'JWT' },
    { sub: user().id, aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 },
    'fixture',
  ]
    .map((v) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url'))
    .join('.');
  const session = () => ({
    access_token: jwt,
    refresh_token: 'fixture-refresh',
    expires_in: 3600,
    token_type: 'bearer',
    user: user(),
  });
  await page.route('**/auth/v1/**', (route) =>
    route.fulfill({ json: route.request().url().includes('/token') ? session() : user() })
  );
  await page.route('**/api/v1/auth/**', (route) => {
    const path = new URL(route.request().url()).pathname,
      body = route.request().postDataJSON();
    let data = {};
    if (path.endsWith('/check')) data = { available: true, username: body.username };
    if (path.endsWith('/signup')) {
      personalization = body.personalization;
      data = {
        challengeId: '22222222-2222-4222-8222-222222222222',
        email,
        expiresAt: Date.now() + 300000,
        resendAt: Date.now() + 60000,
      };
    }
    if (path.endsWith('/signup/verify')) {
      registrationPending = true;
      data = { session: session() };
    }
    if (path.endsWith('/signup/complete')) {
      registrationPending = false;
      expect(route.request().headers().authorization).toBe('Bearer ' + jwt);
      data = { next: personalization ? '/onboarding' : '/' };
    }
    if (path.endsWith('/onboarding')) skipped = body.skipped;
    if (path.endsWith('/login')) data = session();
    return route.fulfill({ json: { success: true, data } });
  });
});

async function fill(page, optional = true) {
  await page.getByLabel('닉네임', { exact: true }).fill('새회원');
  await page.getByLabel('아이디', { exact: true }).fill('NEWUSER123');
  await expect(page.getByLabel('아이디', { exact: true })).toHaveValue('newuser123');
  await page.getByRole('button', { name: '아이디 중복 확인', exact: true }).click();
  await expect(page.getByText('아이디 중복 확인 완료')).toBeVisible();
  await page.getByLabel('이메일', { exact: true }).fill(email);
  await page.getByRole('button', { name: '이메일 중복 확인', exact: true }).click();
  await expect(page.getByText('이메일 중복 확인 완료')).toBeVisible();
  await page.getByLabel('비밀번호', { exact: true }).fill(password);
  await page.getByLabel('비밀번호 확인', { exact: true }).fill(password);
  for (const label of [
    '만 14세 이상입니다 (필수)',
    '서비스 이용약관 동의 (필수)',
    '계정 정보·서비스 이용 기록 수집·이용 동의 (필수)',
  ])
    await page.getByLabel(label, { exact: true }).check();
  if (optional) await page.getByLabel('맞춤정보 수집·이용 동의 (선택)', { exact: true }).check();
}
async function send(page, optional = true) {
  await page.goto('/signup');
  await fill(page, optional);
  await page.getByRole('button', { name: '인증번호 발송', exact: true }).click();
  await expect(page.getByRole('heading', { name: '이메일 인증번호 확인' })).toBeVisible();
}
async function verify(page) {
  await page.getByLabel('인증번호', { exact: true }).fill('123456');
  await page.getByRole('button', { name: '인증하고 가입 완료하기', exact: true }).click();
}

test('JSX routes, input validation, check invalidation and press-only password work on phones', async ({
  page,
}) => {
  await page.goto('/login');
  await page.getByRole('link', { name: '회원가입', exact: true }).click();
  await expect(page).toHaveURL(/\/signup$/);
  await fill(page);
  await page.getByLabel('비밀번호 확인', { exact: true }).fill('different');
  await page.getByRole('button', { name: '인증번호 발송', exact: true }).click();
  await expect(page.getByText('비밀번호가 서로 다릅니다.')).toBeVisible();
  const input = page.getByLabel('비밀번호', { exact: true }),
    eye = page.getByRole('button', { name: '비밀번호 표시하기', exact: true });
  await eye.scrollIntoViewIfNeeded();
  await eye.hover();
  await page.mouse.down();
  await expect(input).toHaveAttribute('type', 'text');
  await page.mouse.up();
  await expect(input).toHaveAttribute('type', 'password');
  await page.getByLabel('아이디', { exact: true }).fill('changedid');
  await expect(page.getByText('아이디 중복 확인 완료')).toHaveCount(0);
  for (const width of [320, 390, 480]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
    ).toBeTruthy();
  }
  await page.screenshot({ path: 'test-results/signup-jsx.png', fullPage: true });
});
test('required consent is enforced, optional refusal is accepted and secrets are not persisted', async ({
  page,
}) => {
  let requested;
  await page.route('**/api/v1/auth/signup', (route) => {
    requested = route.request().postDataJSON();
    return route.fulfill({
      json: {
        success: true,
        data: {
          challengeId: '22222222-2222-4222-8222-222222222222',
          email,
          expiresAt: Date.now() + 300000,
          resendAt: Date.now() + 60000,
        },
      },
    });
  });
  await page.goto('/signup');
  await fill(page, false);
  await page.getByLabel('만 14세 이상입니다 (필수)', { exact: true }).uncheck();
  await page.getByRole('button', { name: '인증번호 발송', exact: true }).click();
  await expect(page.getByText('만 14세 이상 확인이 필요해요.')).toBeVisible();
  expect(requested).toBeUndefined();
  await page.getByLabel('만 14세 이상입니다 (필수)', { exact: true }).check();
  await page.getByRole('button', { name: '인증번호 발송', exact: true }).click();
  await expect(page.getByRole('heading', { name: '이메일 인증번호 확인' })).toBeVisible();
  expect(requested.personalization).toBe(false);
  expect(requested.username).toBe('newuser123');
  expect(
    await page.evaluate(() => JSON.stringify({ local: localStorage, session: sessionStorage }))
  ).not.toContain(password);
  await expect(page.getByRole('button', { name: /인증번호 재발송/ })).toBeDisabled();
});
test('OTP verification completes with the authenticated owner and opens JSX onboarding', async ({
  page,
}) => {
  await send(page);
  await verify(page);
  await expect(page).toHaveURL(/\/onboarding$/);
  await expect(page.getByRole('heading', { name: '맞춤정보 초기 설정' })).toBeVisible();
  await page.getByRole('button', { name: '건너뛰기', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '맞춤정보 건너뛰기' })).toContainText(
    '맞춤정보가 없으면'
  );
  await page.getByRole('button', { name: '건너뛰고 홈으로', exact: true }).click();
  await expect(page).toHaveURL('http://127.0.0.1:5173/');
});
test('optional refusal opens home without onboarding', async ({ page }) => {
  await send(page, false);
  await verify(page);
  await expect(page).toHaveURL('http://127.0.0.1:5173/');
  await expect(page.getByRole('heading', { name: '맞춤정보 초기 설정' })).toHaveCount(0);
});

test('empty personalized information shows settings instead of inferred recommendations', async ({
  page,
}) => {
  let catalogAuthorized = false;
  await page.route('**/api/v1/policy-catalog', (route) => {
    catalogAuthorized = !!route.request().headers().authorization?.startsWith('Bearer ');
    return route.fulfill({
      json: { success: true, data: { policies: [], events: [], totalCount: 0 } },
    });
  });
  await page.route('**/api/v1/home', (route) =>
    route.fulfill({
      json: {
        success: true,
        data: {
          profile: { has_profile: false, age: null, region_name: null, current_status: [] },
          categories: [],
          top_picks: [],
          closing_bookmarks: [],
          all_total: 0,
        },
      },
    })
  );
  await send(page, false);
  await verify(page);
  await expect(
    page.getByText('맞춤정보를 설정하면 나에게 맞는 혜택을 추천해 드려요', { exact: true })
  ).toBeVisible();
  expect(catalogAuthorized).toBe(true);
  await page.getByRole('link', { name: '설정하기', exact: true }).click();
  await expect(page).toHaveURL(/\/settings\?view=profile$/);
});
test('bad OTP is reported, reload preserves the request and editing cancels it', async ({
  page,
}) => {
  await send(page);
  await page.route('**/api/v1/auth/signup/verify', (route) =>
    route.fulfill({ status: 400, json: { success: false, message: '인증번호가 올바르지 않아요.' } })
  );
  await verify(page);
  await expect(page.getByRole('alert')).toHaveText('인증번호가 올바르지 않아요.');
  await page.reload();
  await expect(page.getByLabel('인증번호', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '가입 정보 수정', exact: true }).click();
  await expect(page.getByLabel('이메일', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('cheonghae-signup-request'))).toBeNull();
});
test('new username login passes through the account API', async ({ page }) => {
  let credentials;
  await page.route('**/api/v1/auth/login', async (route) => {
    credentials = route.request().postDataJSON();
    return route.fulfill({
      status: 401,
      json: { success: false, message: '아이디와 비밀번호를 확인해주세요.' },
    });
  });
  await page.goto('/login');
  await page.getByLabel('아이디 또는 이메일', { exact: true }).fill('newuser123');
  await page.getByLabel('비밀번호', { exact: true }).fill(password);
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  expect(credentials).toEqual({ identifier: 'newuser123', password });
});

test('duplicate checks report pending and server errors next to the input',async({page})=>{
  let release
  const held=new Promise(resolve=>release=resolve)
  await page.route('**/api/v1/auth/username/check',async route=>{await held;return route.fulfill({status:503,json:{success:false,message:'인증 서버에 연결하지 못했어요. 다시 시도해주세요.'}})})
  await page.goto('/signup')
  await page.getByLabel('아이디',{exact:true}).fill('newuser123')
  await page.getByRole('button',{name:'아이디 중복 확인',exact:true}).click()
  await expect(page.getByRole('button',{name:'확인 중…',exact:true})).toBeDisabled()
  release()
  const usernameField=page.locator('#signup-username').locator('..').locator('..')
  await expect(usernameField.getByRole('alert')).toContainText('인증 서버에 연결하지 못했어요.')
  await expect(page.getByRole('button',{name:'아이디 중복 확인',exact:true})).toBeEnabled()
})

test('duplicate checks show separate results and editing invalidates each result',async({page})=>{
  await page.route('**/api/v1/auth/username/check',route=>{const {username}=route.request().postDataJSON();return route.fulfill({json:{success:true,data:{username,available:username!=='existingid'}}})})
  await page.route('**/api/v1/auth/email/check',route=>{const {email}=route.request().postDataJSON();return route.fulfill({json:{success:true,data:{available:email!=='existing@example.com'}}})})
  await page.goto('/signup')
  await page.getByLabel('아이디',{exact:true}).fill('existingid')
  await page.getByRole('button',{name:'아이디 중복 확인',exact:true}).click()
  await expect(page.getByRole('status').filter({hasText:'이미 사용 중인 아이디예요.'})).toBeVisible()
  await page.getByLabel('이메일',{exact:true}).fill('existing@example.com')
  await page.getByRole('button',{name:'이메일 중복 확인',exact:true}).click()
  await expect(page.getByRole('status').filter({hasText:'이미 가입했거나 인증 진행 중인 이메일이에요.'})).toBeVisible()
  await expect(page.getByText('아이디 중복 확인 완료')).toHaveCount(0)
  await page.getByLabel('아이디',{exact:true}).fill('newuser123')
  await expect(page.getByText('이미 사용 중인 아이디예요.',{exact:false})).toHaveCount(0)
  await page.getByRole('button',{name:'아이디 중복 확인',exact:true}).click()
  await expect(page.getByRole('status').filter({hasText:'사용할 수 있는 아이디예요.'})).toBeVisible()
  await expect(page.getByRole('status').filter({hasText:'이미 가입했거나 인증 진행 중인 이메일이에요.'})).toBeVisible()
  await page.getByLabel('이메일',{exact:true}).fill('new@example.com')
  await page.getByRole('button',{name:'이메일 중복 확인',exact:true}).click()
  await expect(page.getByRole('status').filter({hasText:'사용할 수 있는 이메일이에요.'})).toBeVisible()
})

test('JSX onboarding validates age and saves the same profile fields used by My', async ({
  page,
}) => {
  let saved;
  await page.route('**/api/v1/me/profile', (route) => {
    saved = route.request().postDataJSON();
    return route.fulfill({ json: { success: true, data: saved } });
  });
  await send(page);
  await verify(page);
  await expect(page.getByRole('heading', { name: '맞춤정보 초기 설정' })).toBeVisible();
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
  const underage = String(Number(today.slice(0, 4)) - 13) + today.slice(4);
  await page.getByLabel('생년월일', { exact: true }).fill(underage);
  await page.getByRole('button', { name: '저장하고 시작하기', exact: true }).click();
  await expect(page.getByText('만 14세 이상만 이용할 수 있어요.')).toBeVisible();
  expect(saved).toBeUndefined();
  await page.getByLabel('생년월일', { exact: true }).fill('2000-01-01');
  await page.getByLabel('시·도', { exact: true }).selectOption('부산광역시');
  await page.getByLabel('시·군·구', { exact: true }).selectOption('부산광역시 사하구');
  await page.getByLabel('현재 상태', { exact: true }).selectOption('취업준비생');
  await page.getByLabel('주거·생활', { exact: true }).check();
  await page.getByRole('button', { name: '저장하고 시작하기', exact: true }).click();
  await expect(page).toHaveURL('http://127.0.0.1:5173/');
  expect(saved).toMatchObject({
    birth_date: '2000-01-01',
    region_code: '26380',
    current_status: ['취업준비생'],
    interest_categories: ['주거·생활'],
  });
});
