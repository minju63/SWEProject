import { test, expect } from '@playwright/test'

// Inspect every routed mock screen, including nested settings and policy states.
const screens = [
  ['home', '/'], ['search', '/search'], ['results', '/search?category=주거·생활&results=1'],
  ['map', '/map'], ['calendar', '/calendar'], ['settings', '/settings'],
  ['profile', '/settings?view=profile'], ['notification-settings', '/settings?view=notifications'],
  ['alarm', '/settings/alarm'], ['notifications', '/notifications'],
  ['presentation', '/presentation'], ['missing-policy', '/policies/missing'],
  ['missing-compare', '/policies/missing/compare/missing'],
  ['missing-compare-select', '/policies/missing/compare/select'],
] as const

for (const [name, path] of screens) {
  test(`mock screen: ${name}`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(path)
    await expect(page.locator('.device-content h1, .device-content h2').first()).toBeVisible()
    await expect(page.getByText('주거 정책을 불러오지 못했어요.', { exact: true })).toHaveCount(0)
    for (const width of [320, 390, 480]) {
      await page.setViewportSize({ width, height: 844 })
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
      await page.screenshot({ path: `test-results/screens/${name}-${width}.png` })
    }
    expect(errors).toEqual([])
  })
}

test('real policy detail, selection and comparison retain mock layout', async ({ page, request }) => {
  const { data } = await (await request.get('/api/v1/housing/policies')).json()
  const [a, b] = data
  const pages = [
    ['detail', `/policies/${a.policy_id}`, '정책 상세'],
    ['compare-select', `/policies/${a.policy_id}/compare/select`, '비교할 정책 선택'],
    ['compare', `/policies/${a.policy_id}/compare/${b.policy_id}`, '정책 비교'],
  ]
  for (const [name, path, heading] of pages) {
    await page.goto(path)
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
    for (const width of [320, 390, 480]) {
      await page.setViewportSize({ width, height: 844 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
      await page.screenshot({ path: `test-results/screens/${name}-${width}.png` })
    }
  }
})
