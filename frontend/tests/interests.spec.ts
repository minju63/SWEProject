import { test, expect } from "@playwright/test";
import {
  interestDetailKey,
  scopedInterestDetails,
} from "../src/data/interestSelection";
import { profileToConditions } from "../src/data/conditions";

test("shared labels remain scoped to their selected parent, including old profiles", () => {
  const tree = { "장학·금융": ["장학금", "기타"], 문화: ["전시", "기타"] };
  expect(scopedInterestDetails(["장학·금융"], [], tree)).toEqual(["장학·금융::장학금", "장학·금융::기타"]);
  expect(
    scopedInterestDetails(["장학·금융"], ["장학금", "기타"], tree),
  ).toEqual(["장학·금융::장학금", "장학·금융::기타"]);
  const details = [
    interestDetailKey("장학·금융", "기타"),
    interestDetailKey("문화", "기타"),
  ];
  expect(scopedInterestDetails(["문화"], details, tree)).toEqual([
    "문화::기타",
  ]);
  expect(
    profileToConditions({
      name: "테스트",
      age: "",
      region: "",
      status: "",
      housingType: "",
      interests: ["장학·금융"],
      interestDetails: ["장학·금융::장학금"],
    }).interestDetails,
  ).toEqual(["장학금"]);
});

test("finance and culture selections do not turn each other on or off", async ({
  page,
}) => {
  await page.goto("/settings?view=profile");
  const finance = page.locator('[data-interest="장학·금융"]'),
    culture = page.locator('[data-interest="문화"]');
  await finance.getByRole("button", { name: "장학·금융 전체 선택" }).click();
  await expect(
    finance.getByRole("button", { name: "장학·금융 전체 선택" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(culture.getByText(/세부분류 .*개 선택/)).toHaveCount(0);
  await culture.getByRole("button", { name: "문화", exact: true }).click();
  await expect(
    culture.getByRole("button", { name: "기타", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await culture.getByRole("button", { name: "기타", exact: true }).click();
  await finance.getByRole("button", { name: "장학·금융 전체 선택" }).click();
  await expect(
    culture.getByRole("button", { name: "기타", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(finance.getByText(/세부분류 .*개 선택/)).toHaveCount(0);
  await finance.getByRole("button", { name: "장학·금융 전체 선택" }).click();
  await culture.getByRole("button", { name: "문화 전체 선택" }).click();
  await culture.getByRole("button", { name: "문화 전체 선택" }).click();
  await expect(
    finance.getByRole("button", { name: "장학·금융 전체 선택" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(culture.getByText(/세부분류 .*개 선택/)).toHaveCount(0);
});
