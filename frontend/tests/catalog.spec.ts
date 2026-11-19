import { test, expect } from "@playwright/test";
import { databaseEligibility } from "../src/data/databaseEligibility";
import { emptyConditions } from "../src/data/conditions";
import type { PolicyCatalogItem } from "../src/data/policies";
test("verified DB rules react to profile changes while unknown and textual conditions stay unresolved", () => {
  const p = {
    fromDatabase: true,
    eligibilityVerified: true,
    eligibilityRules: {
      all: [{ field: "region", op: "eq", value: "26230" }],
      exclude: [],
    },
  } as unknown as PolicyCatalogItem;
  expect(
    databaseEligibility(p, emptyConditions, "부산광역시 부산진구").overall,
  ).toBe("신청 가능");
  expect(
    databaseEligibility(p, emptyConditions, "부산광역시 사하구").overall,
  ).toBe("대상 아님");
  expect(
    databaseEligibility(
      { ...p, eligibilityVerified: false },
      emptyConditions,
      "부산광역시 부산진구",
    ).overall,
  ).toBe("확인 필요");
  const age = {
    ...p,
    eligibilityRules: {
      all: [
        { field: "age", op: "between", value: [18, 39] },
        { field: "special_targets", op: "text", value: "예술인" },
      ],
      exclude: [{ text: "증빙 확인" }],
    },
  };
  expect(
    databaseEligibility(age, { ...emptyConditions, age: "25" }, "부산광역시")
      .overall,
  ).toBe("확인 필요");
  expect(
    databaseEligibility(age, { ...emptyConditions, age: "50" }, "부산광역시")
      .overall,
  ).toBe("대상 아님");
});
test("all four real policy domains load without prototype policies; events remain a separate collection", async ({
  page,
  request,
}) => {
  test.setTimeout(120000);
  const response = await request.get("/api/v1/policy-catalog");
  expect(response.ok()).toBeTruthy();
  const { data } = await response.json();
  expect(data.policies.length + data.events.length).toBe(data.totalCount);
  for (const domain of ["JOB", "HOUSING", "FINANCE", "CULTURE"]) {
    const p = data.policies.find((p: any) => p.collection_domain === domain);
    expect(p).toBeTruthy();
    await page.goto("/policies/" + p.policy_id);
    await expect(
      page.getByRole("heading", { name: p.title, exact: true }),
    ).toBeVisible({timeout:30000});
    await expect(
      page.getByText("[object Object]", { exact: false }),
    ).toHaveCount(0);
  }
  await page.goto("/policies/busan-double-account");
  await expect(page.getByText("정책을 찾을 수 없어요.")).toBeVisible({timeout:30000});
  await page.goto("/events");
  await expect(
    page.getByRole("heading", { name: "문화행사", exact: true }),
  ).toBeVisible({timeout:30000});
  if (data.events.length)
    await expect(
      page.getByRole("heading", { name: data.events[0].title, exact: true }),
    ).toBeVisible({timeout:30000});
});
