import { test, expect } from '@playwright/test'
test('login matches the reference layout and keeps password visibility and navigation working', async ({
  page,
}) => {
  await page.goto('/login')
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('heading', { name: '청해', exact: true })).toBeVisible()
  const image = dialog.getByAltText('청해 상어 캐릭터')
  await expect(image).toBeVisible()
  expect(await image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)
  await dialog.getByLabel('아이디 또는 이메일', { exact: true }).fill('minju2026@example.com')
  const password = dialog.getByLabel('비밀번호', { exact: true })
  await password.fill('test-password')
  await expect(password).toHaveAttribute('type', 'password')
  await dialog.getByRole('button', { name: '비밀번호 보기', exact: true }).click()
  await expect(password).toHaveAttribute('type', 'text')
  await dialog.getByRole('button', { name: '비밀번호 숨기기', exact: true }).click()
  await expect(password).toHaveAttribute('type', 'password')
  expect(
    await dialog
      .getByRole('button', { name: '로그인', exact: true })
      .evaluate((el) => getComputedStyle(el).backgroundColor)
  ).toBe('rgb(47, 123, 245)')
  for (const width of [320, 390, 480]) {
    await page.setViewportSize({ width, height: 844 })
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
    ).toBeTruthy()
    await page.screenshot({ path: `test-results/login-${width}.png` })
  }
  await dialog.getByRole('button', { name: '아이디 찾기', exact: true }).click()
  await expect(
    dialog.getByText('기존 계정은 이메일로 로그인할 수 있어요. 아이디 찾기 메일은 준비 중이에요.')
  ).toBeVisible()
  await dialog.getByRole('link', { name: '회원가입', exact: true }).click()
  await expect(page).toHaveURL(/\/signup$/)
})
