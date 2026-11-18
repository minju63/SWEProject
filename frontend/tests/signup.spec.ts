import { test, expect, type Page } from '@playwright/test'

const email = 'signup-test@example.com', password = 'SignupTest1!'
const user = { id: '11111111-1111-4111-8111-111111111111', email, aud: 'authenticated', role: 'authenticated', user_metadata: { display_name: '새회원' }, app_metadata: {}, created_at: new Date().toISOString() }
const token = [{ alg: 'HS256', typ: 'JWT' }, { sub: user.id, aud: 'authenticated', exp: Math.floor(Date.now()/1000)+3600 }, 'test-signature'].map(v => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url')).join('.')
const session = { access_token: token, refresh_token: 'test-refresh', expires_in: 3600, token_type: 'bearer', user }

test.beforeEach(async ({ page }) => {
  // Registration tests never create real accounts or send emails.
  await page.route('**/api/v1/housing/policies', route => route.fulfill({ json: { success: true, data: [] } }))
  await page.route('**/api/v1/me/workspace', route => route.fulfill({ json: { success: true, data: { bookmarks: [], recent: [], applications: [], profile: null, documents: [], tasks: [] } } }))
  await page.route('**/auth/v1/**', route => route.fulfill({ json: user }))
})
async function fill(page: Page, confirmation = password) {
  await page.getByLabel('이메일', { exact: true }).fill(email)
  await page.getByLabel('닉네임', { exact: true }).fill('새회원')
  await page.getByLabel('비밀번호', { exact: true }).fill(password)
  await page.getByLabel('비밀번호 확인', { exact: true }).fill(confirmation)
}

test('login entry links to SWfinal signup; validates and keeps phone layout', async ({ page }) => {
  let requests = 0
  await page.route('**/auth/v1/signup**', route => { requests++; return route.fulfill({ json: { user, session: null } }) })
  await page.goto('/my'); await page.getByRole('button', { name: '로그인하기 ›' }).click()
  await page.getByRole('link', { name: '회원가입', exact: true }).click()
  await expect(page).toHaveURL(/\/signup$/)
  await expect(page.getByRole('heading', { name: '회원가입', exact: true })).toBeVisible()
  expect((await page.getByRole('button', { name: '마이 화면으로 돌아가기' }).boundingBox())!.y).toBeGreaterThanOrEqual(44)
  await fill(page, 'different')
  await page.getByRole('button', { name: '비밀번호 표시하기', exact: true }).click()
  await expect(page.getByLabel('비밀번호', { exact: true })).toHaveAttribute('type', 'text')
  await page.getByRole('button', { name: '회원가입 완료하기' }).click()
  await expect(page.getByText('비밀번호가 서로 다릅니다.')).toBeVisible(); expect(requests).toBe(0)
  for (const width of [320, 390, 480]) {
    await page.setViewportSize({ width, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
    await page.screenshot({ path: `test-results/signup-${width}.png`, fullPage: true })
  }
})

test('signup submits correct project data; confirmation and resend remain unauthenticated', async ({ page }) => {
  let sent = 0, resent = 0
  await page.clock.install()
  await page.route('**/auth/v1/signup**', route => {
    sent++; const body = route.request().postDataJSON()
    expect(body.email).toBe(email); expect(body.password).toBe(password); expect(body.data.display_name).toBe('새회원')
    expect(new URL(route.request().url()).searchParams.get('redirect_to')).toBe('http://127.0.0.1:5173/auth/confirm')
    return route.fulfill({ json: { ...user, identities: [{ provider: 'email' }] } })
  })
  await page.route('**/auth/v1/resend**', route => { resent++; expect(route.request().postDataJSON().type).toBe('signup'); return route.fulfill({ json: {} }) })
  await page.goto('/signup'); await fill(page); await page.getByRole('button', { name: '회원가입 완료하기' }).click()
  await expect(page.getByRole('heading', { name: '이메일 인증을 확인해주세요' })).toBeVisible(); expect(sent).toBe(1)
  await expect(page.getByRole('button', { name: /인증 메일 재전송/ })).toBeDisabled()
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(password)
  await page.clock.fastForward(61000)
  // Countdown uses a timeout each second; advance subsequent ticks explicitly.
  for(let i=0;i<60;i++) await page.clock.runFor(1000)
  await page.getByRole('button', { name: '인증 메일 재전송', exact: true }).click()
  await expect(page.getByText('인증 메일을 다시 요청했어요. 받은 편지함을 확인해주세요.')).toBeVisible(); expect(resent).toBe(1)
  await page.screenshot({ path: 'test-results/signup-email-confirm.png', fullPage: true })
})

test('server rejects signup honestly and allows retry', async ({ page }) => {
  await page.route('**/auth/v1/signup**', route => route.fulfill({ status: 429, json: { code: 'over_email_send_rate_limit', msg: 'rate limit' } }))
  await page.goto('/signup'); await fill(page); await page.getByRole('button', { name: '회원가입 완료하기' }).click()
  await expect(page.getByRole('alert')).toHaveText('요청이 많아요. 잠시 후 다시 시도해주세요.')
  await expect(page.getByRole('button', { name: '회원가입 완료하기' })).toBeEnabled()
  await expect(page.getByRole('heading', { name: '이메일 인증을 확인해주세요' })).toHaveCount(0)
})

test('a server-issued session opens the account workspace with signup nickname', async ({ page }) => {
  await page.route('**/auth/v1/signup**', route => route.fulfill({ json: session }))
  await page.goto('/signup'); await fill(page); await page.getByRole('button', { name: '회원가입 완료하기' }).click()
  await expect(page).toHaveURL(/\/my$/)
  await expect(page.getByRole('heading', { name: '새회원님' })).toBeVisible()
})

test('confirmation callback handles valid and expired links', async ({ page }) => {
  await page.goto('/auth/confirm')
  await expect(page.getByRole('alert')).toContainText('인증 링크가 만료되었거나 올바르지 않아요.')
  // An email opens a new document; changing only the hash would not reinitialize Auth.
  await page.goto('about:blank')
  await page.goto(`/auth/confirm#access_token=${token}&refresh_token=test-refresh&expires_in=3600&token_type=bearer&type=signup`)
  await expect(page).toHaveURL(/\/my$/)
  await expect(page.getByRole('heading', { name: '새회원님' })).toBeVisible()
})
