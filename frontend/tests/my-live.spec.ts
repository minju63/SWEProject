import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Opt-in: writes exclusively to the explicitly created, disposable test account.
test("real account: manual applications, preparation checks, dates, recent five, home and calendar", async ({
  page,
  request,
}) => {
  test.skip(
    process.env.RUN_MY_LIVE !== "1",
    "Set RUN_MY_LIVE=1 to use the dedicated test account",
  );
  test.setTimeout(180000);
  page.setDefaultTimeout(15000);
  const credentials = JSON.parse(
    fs.readFileSync(path.resolve("../.local/test-account.json"), "utf8"),
  );
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/my");
  await page.getByRole("button", { name: "로그인하기 ›" }).click();
  await page.getByLabel("이메일", { exact: true }).fill(credentials.email);
  await page.getByLabel("비밀번호", { exact: true }).fill(credentials.password);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "로그인", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("계정 데이터를 확인하고 있어요.")).toHaveCount(0);
  const token = await page.evaluate(() => {
    const key = Object.keys(localStorage).find(
      (k) => k.startsWith("sb-") && k.endsWith("-auth-token"),
    );
    return key ? JSON.parse(localStorage.getItem(key)!).access_token : null;
  });
  expect(token).toBeTruthy();
  const api = async (url: string, method = "GET", body?: any) => {
    const r = await request.fetch("/api/v1/me" + url, {
      method,
      headers: { Authorization: "Bearer " + token },
      data: body,
    });
    expect(r.ok(), url).toBeTruthy();
    return (await r.json()).data;
  };
  const before = await api("/workspace");
  expect(Array.isArray(before.manual)).toBeTruthy();
  console.log("Dedicated account login and workspace verified");
  const today = new Date().toLocaleDateString("sv-SE", {
      timeZone: "Asia/Seoul",
    }),
    title = "직접 입력 검증 " + Date.now();
  await page.getByRole("button", { name: "＋ 혜택 추가", exact: true }).click();
  await page.getByRole("button", { name: "직접 입력", exact: true }).click();
  const form = page
    .locator("form")
    .filter({
      has: page.getByRole("heading", {
        name: "혜택 추가",
        exact: true,
      }),
    });
  await form.getByLabel("혜택 이름").fill(title);
  await form.getByLabel("신청 마감일").fill(today);
  await form.getByLabel("메모").fill("테스트 계정의 개인 기록");
  await form.getByRole("button", { name: "추가하기", exact: true }).click();
  await expect(form).toHaveCount(0);
  console.log("Manual application created through UI");
  let workspace = await api("/workspace");
  const manual = workspace.manual.find((a: any) => a.policyName === title);
  expect(manual).toBeTruthy();
  await page.getByRole("heading", { name: title, exact: true }).click();
  const card = page.locator(".my-preparation");
  await card.getByRole("button", { name: "＋ 준비물 직접 추가" }).click();
  await card.getByPlaceholder("준비물 이름").fill("직접 추가 서류");
  await card.getByRole("button", { name: "추가", exact: true }).click();
  await expect(
    card.getByRole("checkbox", { name: "직접 추가 서류 준비 여부" }),
  ).toBeVisible();
  await expect(page.getByText("계정 데이터를 확인하고 있어요.")).toHaveCount(0);
  await card
    .getByRole("checkbox", { name: "직접 추가 서류 준비 여부" })
    .click();
  await expect(
    card.getByRole("checkbox", { name: "직접 추가 서류 준비 여부" }),
  ).toBeChecked();
  await page.reload();
  await page.getByRole("heading", { name: title, exact: true }).click();
  await expect(
    card.getByRole("checkbox", { name: "직접 추가 서류 준비 여부" }),
  ).toBeChecked();
  await page.goto("/calendar");
  await expect(page.getByText(title, { exact: true })).toBeVisible();
  await expect(page.getByText("신청 마감", { exact: true })).toBeVisible();
  await api("/manual-applications/" + manual.id, "PATCH", {
    stage: "신청 완료",
    applicationDate: today,
    expectedResultDate: "미정",
  });
  workspace = await api("/workspace");
  expect(
    workspace.manual.find((a: any) => a.id === manual.id).expectedResultDate,
  ).toBe("미정");
  await api("/manual-applications/" + manual.id, "PATCH", {
    expectedResultDate: today,
  });
  workspace = await api("/workspace");
  expect(workspace.manual.find((a: any) => a.id === manual.id).stage).toBe(
    "결과 확인",
  );
  await page.goto("/calendar");
  await expect(page.getByRole('button').filter({has:page.getByText(title,{exact:true})}).filter({has:page.getByText('결과 발표',{exact:true})})).toBeVisible();
  await expect(page.getByRole('button').filter({has:page.getByText(title,{exact:true})}).filter({has:page.getByText('신청 완료',{exact:true})})).toBeVisible();
  const { data: policies } = await (
    await request.get("/api/v1/housing/policies")
  ).json();
  expect(policies.length).toBeGreaterThan(5);
  for (const p of policies.slice(0, 6))
    await api("/recent/" + p.policy_id, "POST");
  workspace = await api("/workspace");
  expect(workspace.recent).toHaveLength(5);
  expect(workspace.recent[0].policy_id).toBe(policies[5].policy_id);
  expect(
    workspace.recent.some((r: any) => r.policy_id === policies[0].policy_id),
  ).toBeFalsy();
  await api("/profile", "PUT", {
    birth_date: "2001-05-01",
    region_code: "26260",
    current_status: ["대학생"],
    interest_categories: ["주거·생활"],
    housing_type: "월세",
    final_education: "대학교",
    household_type: "1인 가구",
  });
  await page.goto("/my");
  await expect(page.getByText("맞춤정보 100%", { exact: true })).toBeVisible();
  await expect(page.getByText(/부산광역시 동래구/).first()).toBeVisible();
  await page.goto("/");
  await expect(
    page.getByText("부산광역시 동래구", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("25세 휴학생", { exact: false })).toHaveCount(0);
  await api("/profile", "PUT", {
    region_code: null,
    final_education: null,
    household_type: null,
  });
  await page.goto("/my");
  await expect(page.getByText("맞춤정보 57%", { exact: true })).toBeVisible();
  for (const width of [320, 390, 480]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
  }
  expect(errors).toEqual([]);
});
