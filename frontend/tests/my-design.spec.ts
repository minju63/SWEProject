import { test, expect, Page } from "@playwright/test"
import fs from 'node:fs'

// Isolated account/API fixtures: exercises persistence without changing the shared DB.
async function account(page: Page, housingRules?: Record<string, unknown>) {
  const uid = "11111111-1111-4111-8111-111111111111"
  const user = {
    id: uid,
    email: "my-design@example.com",
    aud: "authenticated",
    role: "authenticated",
    user_metadata: { display_name: "민주" },
    app_metadata: {},
    created_at: new Date().toISOString(),
  }
  const token = [
    { alg: "HS256", typ: "JWT" },
    {
      sub: uid,
      aud: "authenticated",
      exp: Math.floor(Date.now() / 1000) + 3600,
    },
    "fixture",
  ]
    .map((v) =>
      Buffer.from(typeof v === "string" ? v : JSON.stringify(v)).toString(
        "base64url",
      ),
    )
    .join(".")
  const policies = [
    "청년 월세 지원",
    "청년 이사비 지원",
    "청년 전세자금 대출이자 지원",
  ].map((title, i) => ({
    policy_id: `22222222-2222-4222-8222-22222222222${i}`,
    title,
    collection_domain: "HOUSING",
    item_type: "POLICY",
    policy_region: [{ region_code: "26380" }],
    application_end_date: "2026-12-20",
    recruitment_status: "모집 중",
    source_url: "https://example.com/policy",
    required_documents: [],
    ...(i === 0 && housingRules ? {eligibility_conditions:housingRules,eligibility_verified:false} : {}),
  }))
  const base = {
    region: "사하구",
    category: "주거·생활",
    applicationDeadline: "2026-12-20",
    applicationDate: "2026-10-02",
    expectedResultDate: "2026-12-22",
    applicationNumber: "",
    reviewStatus: "심사 중",
    memo: "",
    officialUrl: "https://example.com/policy",
    eligibilityChecks: [
      { label: "만 18~34세", status: "matched" },
      { label: "소득 기준은 원문 확인", status: "needs_check" },
    ],
    requiredDocuments: [
      {
        name: "신분증 사본",
        description: "주민등록증·운전면허증",
        status: "completed",
        custom: true,
      },
      {
        name: "휴학 증명서",
        description: "해당자만 제출 · 본인에게 적용되는 조건인지 확인해주세요.",
        status: "pending",
        custom: true,
      },
    ],
    resultStatus: "결과 대기",
    resultDate: "",
    nextActions: [],
  }
  let manual: any[] = [
    {
      ...base,
      id: "manual-preparing",
      policyId: "manual-preparing",
      policyName: "청년 면접정장 무료 대여",
      category: "취업·진로",
      stage: "신청 준비",
    },
    {
      ...base,
      id: "manual-applied",
      policyId: "manual-applied",
      policyName: "부산 청년 구직활동 지원금",
      category: "취업·진로",
      stage: "신청 완료",
    },
    {
      ...base,
      id: "manual-result",
      policyId: "manual-result",
      policyName: "청년 자격증 응시료 지원",
      category: "취업·진로",
      stage: "결과 확인",
    },
  ]
  const applications: any[] = []
  const profile = {
    birth_date: "2001-05-01",
    region_code: "26380",
    current_status: ["대학생(재학·휴학)"],
    interest_categories: ["주거·생활", "취업·진로"],
    housing_type: "월세",
    final_education: "고등학교 졸업",
    household_type: "1인 가구",
    ...(housingRules ? {home_ownership:'유주택',lives_separately:false} : {}),
  }
  await page.route("**/api/v1/policy-catalog", (route) =>
    route.fulfill({
      json: {
        success: true,
        data: { policies, events: [], totalCount: policies.length },
      },
    }),
  )
  await page.route("**/auth/v1/**", (route) =>
    route.fulfill({
      json: route.request().url().includes("/token")
        ? {
            access_token: token,
            refresh_token: "fixture-refresh",
            expires_in: 3600,
            token_type: "bearer",
            user,
          }
        : user,
    }),
  )
  await page.route("**/api/v1/me/**", (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      body = req.postDataJSON()
    expect(req.headers().authorization).toBe("Bearer " + token)
    if (url.pathname.endsWith("/workspace"))
      return route.fulfill({
        json: {
          success: true,
          data: {
            bookmarks: policies.map((policy) => ({
              policy_id: policy.policy_id,
              policy,
            })),
            recent: policies.map((policy) => ({
              policy_id: policy.policy_id,
              policy,
            })),
            profile,
            applications,
            manual,
            documents: [],
            tasks: [],
          },
        },
      })
    if (
      url.pathname.includes("/manual-applications/") &&
      req.method() === "PATCH"
    )
      Object.assign(
        manual.find(
          (a) => a.id === decodeURIComponent(url.pathname.split("/").pop()!),
        ),
        body,
      )
    if (
      url.pathname.endsWith("/manual-applications") &&
      req.method() === "POST"
    )
      manual.push({ ...body, id: body.policyId })
    if (url.pathname.endsWith("/applications") && req.method() === "POST") {
      const existing = applications.find((a) => a.policy_id === body.policyId)
      if (existing)
        return route.fulfill({ json: { success: true, data: existing } })
      const policy = policies.find((p) => p.policy_id === body.policyId),
        a = {
          application_id: `33333333-3333-4333-8333-${String(applications.length).padStart(12, "0")}`,
          policy_id: body.policyId,
          stage: "PREPARING",
          policy,
        }
      applications.push(a)
      return route.fulfill({ json: { success: true, data: a } })
    }
    if (url.pathname.includes("/applications/") && req.method() === "PATCH")
      Object.assign(
        applications.find(
          (a) => a.application_id === url.pathname.split("/").pop(),
        ),
        body,
      )
    return route.fulfill({ json: { success: true, data: {} } })
  })
  await page.goto("/my")
  await page.getByRole("button", { name: "로그인하기 ›" }).click()
  await page.getByLabel("이메일", { exact: true }).fill(user.email)
  await page.getByLabel("비밀번호", { exact: true }).fill("fixture-password")
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "로그인", exact: true })
    .click()
  await expect(
    page.getByRole("heading", { name: "민주님", exact: true }),
  ).toBeVisible()
  await expect(page.getByText("계정 데이터를 확인하고 있어요.")).toHaveCount(0)
  return { manual, applications }
}

test("My reference layout and preparation checks persist at mobile widths", async ({
  page,
}) => {
  const errors: string[] = []
  page.on("pageerror", (e) => errors.push(e.message))
  await account(page)
  for (const width of [320, 390, 480]) {
    await page.setViewportSize({ width, height: 844 })
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy()
    await page.screenshot({
      path: `test-results/my-design-overview-${width}.png`,
    })
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await page
    .getByRole("heading", { name: "청년 면접정장 무료 대여", exact: true })
    .click()
  await expect(page).toHaveURL(/prepare=manual-preparing/)
  await expect(
    page.getByRole("heading", { name: "준비물 체크리스트" }),
  ).toBeVisible()
  await expect(page.getByText("확인 필요", { exact: true })).toBeVisible()
  const check = page.getByRole("checkbox", { name: "휴학 증명서 준비 여부" })
  await check.click()
  await expect(check).toBeChecked()
  await page.reload()
  await expect(check).toBeChecked()
  await page.getByRole("button", { name: "＋ 준비물 직접 추가" }).click()
  await page.getByPlaceholder("준비물 이름").fill("추가 서류")
  await page.getByRole("button", { name: "추가", exact: true }).click()
  await expect(
    page.getByRole("checkbox", { name: "추가 서류 준비 여부" }),
  ).toBeVisible()
  await page.screenshot({
    path: "test-results/my-design-preparation.png",
    fullPage: true,
  })
  await page.getByRole("button", { name: "신청 완료로 변경" }).click()
  await expect(page).not.toHaveURL(/prepare=/)
  await expect(
    page
      .locator(".my-application")
      .filter({ hasText: "청년 면접정장 무료 대여" }),
  ).toBeVisible()
  expect(errors).toEqual([])
})

test("application accordions and multiple benefit selection retain real field values", async ({
  page,
}) => {
  const state = await account(page)
  await page
    .locator(".my-stage-tabs")
    .getByRole("button", { name: /신청 완료/ })
    .click()
  await page.getByRole("heading", { name: "부산 청년 구직활동 지원금" }).click()
  await expect(page.getByLabel("신청 완료일")).toHaveValue("2026-10-02")
  await page.getByLabel("결과 발표일 미정").click()
  await expect(page.getByLabel("결과 발표일 미정")).toBeChecked()
  await expect(page.getByLabel("결과 발표일", { exact: true })).toBeDisabled()
  await page.screenshot({ path: "test-results/my-design-applied.png" })
  await page
    .locator(".my-stage-tabs")
    .getByRole("button", { name: /결과 확인/ })
    .click()
  await page.getByRole("heading", { name: "청년 자격증 응시료 지원" }).click()
  await page.getByRole("button", { name: "선정", exact: true }).click()
  await expect(
    page.getByRole("button", { name: "선정", exact: true }),
  ).toHaveAttribute("aria-pressed", "true")
  expect(state.manual.find((a) => a.id === "manual-result").resultStatus).toBe(
    "선정",
  )
  await page.screenshot({ path: "test-results/my-design-result.png" })
  await page.getByRole("button", { name: "＋ 혜택 추가", exact: true }).click()
  await page
    .locator(".my-add-sheet")
    .getByRole("button", { name: /청년 월세 지원/ })
    .click()
  await page
    .locator(".my-add-sheet")
    .getByRole("button", { name: /청년 이사비 지원/ })
    .click()
  await expect(
    page.getByRole("button", { name: "2개 추가", exact: true }),
  ).toBeEnabled()
  await page.screenshot({ path: "test-results/my-design-add-sheet.png" })
  await page.getByRole("button", { name: "2개 추가", exact: true }).click()
  await expect(page.locator(".my-add-sheet")).toHaveCount(0)
  expect(state.applications).toHaveLength(2)
  await page
    .locator(".my-saved-tabs")
    .getByRole("button", { name: "종료", exact: true })
    .click()
  await expect(page.getByText("마감된 찜한 혜택이 없어요")).toBeVisible()
  await page
    .getByRole("heading", { name: "찜한 혜택 3" })
    .scrollIntoViewIfNeeded()
  await page.screenshot({ path: "test-results/my-design-saved-empty.png" })
})

test("settings and profile use the same completion and remain responsive", async ({
  page,
}) => {
  await account(page)
  await page.getByRole("button", { name: "설정 열기" }).click()
  await expect(
    page.getByRole("heading", { name: "설정", exact: true }),
  ).toBeVisible()
  await expect(page.getByText("맞춤정보 100%")).toBeVisible()
  await expect(page.getByRole("navigation", { name: "앱 메뉴" })).toBeVisible()
  await page.screenshot({ path: "test-results/my-design-settings.png" })
  await page.getByRole("button", { name: /프로필 및 맞춤정보/ }).click()
  await expect(
    page.getByRole("heading", { name: "프로필 및 맞춤정보", exact: true }),
  ).toBeVisible()
  for (const width of [320, 390, 480]) {
    await page.setViewportSize({ width, height: 844 })
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy()
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: "test-results/my-design-profile-top.png" })
  await page.getByRole("button", { name: "주거·생활", exact: true }).click()
  await page.locator('[data-interest="주거·생활"]').scrollIntoViewIfNeeded()
  await page.screenshot({
    path: "test-results/my-design-profile-interests.png",
  })
})

test('successive preparation changes do not overwrite each other', async ({page}) => {
  await account(page);
  await page.getByRole('heading',{name:'청년 면접정장 무료 대여',exact:true}).click();
  await page.getByRole('checkbox').evaluateAll(elements => { (elements[0] as HTMLElement).click(); (elements[1] as HTMLElement).click(); });
  await expect(page.getByRole('checkbox',{name:'신분증 사본 준비 여부'})).not.toBeChecked();
  await expect(page.getByRole('checkbox',{name:'휴학 증명서 준비 여부'})).toBeChecked();
  await page.reload();
  await expect(page.getByRole('checkbox',{name:'신분증 사본 준비 여부'})).not.toBeChecked();
  await expect(page.getByRole('checkbox',{name:'휴학 증명서 준비 여부'})).toBeChecked();
});

test('a failed save leaves preparation and the custom document draft open', async ({page}) => {
  await account(page);
  await page.getByRole('heading',{name:'청년 면접정장 무료 대여',exact:true}).click();
  const fail = (route: any) => route.request().method()==='PATCH' ? route.fulfill({status:500,json:{success:false,message:'검증용 저장 실패'}}) : route.fallback();
  await page.route('**/api/v1/me/manual-applications/**', fail);
  await page.getByRole('button',{name:'신청 완료로 변경'}).click();
  await expect(page.getByRole('alert')).toContainText('검증용 저장 실패');
  await expect(page).toHaveURL(/prepare=/);
  await page.getByRole('button',{name:'＋ 준비물 직접 추가'}).click();
  await page.getByPlaceholder('준비물 이름').fill('실패 후 다시 저장할 서류');
  await page.getByRole('button',{name:'추가',exact:true}).click();
  await expect(page.getByPlaceholder('준비물 이름')).toHaveValue('실패 후 다시 저장할 서류');
  await expect(page.getByRole('button',{name:'추가',exact:true})).toBeEnabled();
  await page.unroute('**/api/v1/me/manual-applications/**', fail);
  await page.getByRole('button',{name:'추가',exact:true}).click();
  await expect(page.getByRole('checkbox',{name:'실패 후 다시 저장할 서류 준비 여부'})).toBeVisible();
});

test('My shows housing condition groups and individual profile differences without a false whole-policy verdict', async ({page}) => {
  const fixtures=JSON.parse(fs.readFileSync('tests/fixtures/housing-profile.json','utf8'));
  const rules=fixtures.find((p:any)=>p.before.policy_id==='5378d71a-86cb-5297-bc71-a376b91f4fbd').values.eligibility_conditions;
  await account(page,rules);
  await page.getByRole('button',{name:'＋ 혜택 추가',exact:true}).click();
  await page.locator('.my-add-sheet').getByRole('button',{name:/청년 월세 지원/}).click();
  await page.getByRole('button',{name:'1개 추가',exact:true}).click();
  await expect(page.locator('.my-add-sheet')).toHaveCount(0);
  const card=page.locator('.my-application').filter({has:page.getByRole('heading',{name:'청년 월세 지원',exact:true})});
  await expect(card).toContainText('조건 확인 필요');
  await expect(card).not.toContainText('대상 아님');
  await card.getByRole('heading',{name:'청년 월세 지원',exact:true}).click();
  await expect(page.locator('.my-condition-row').filter({hasText:'본인 무주택'}).first()).toContainText('불충족');
  await expect(page.locator('.my-condition-row').filter({hasText:'2026년 신청 대상: 1991~2007년생'})).toContainText('충족');
  await expect(page.getByText(/^소득·재산:/)).toBeVisible();
  await expect(page.getByText(/^제외·중복지원:/)).toBeVisible();
  await expect(page.getByText('전체 자격은 소득·가구·증빙·예외를 함께 확인해 주세요.')).toBeVisible();
  for(const width of [320,390]){
    await page.setViewportSize({width,height:844});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  }
  await page.screenshot({path:'test-results/housing-conditions-my.png',fullPage:true});
  await page.reload();
  await expect(page.getByText(/^소득·재산:/)).toBeVisible();
});
