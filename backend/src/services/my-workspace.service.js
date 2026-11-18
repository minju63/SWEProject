import { randomUUID } from "node:crypto";
import { supabase } from "../lib/supabase.js";
import { AppError } from "../utils/response.js";

// The shared application table requires a registered policy. Keep manual records
// and extra dates in a private Storage bucket, keyed only by the authenticated
// owner. No public policies, Auth claims or JWTs contain these records.
const BUCKET = "user-workspaces",
  queues = new Map();
export const koreaToday = () =>
  new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
export function validDate(value) {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value + "T00:00:00Z")) &&
    new Date(value + "T00:00:00Z").toISOString().slice(0, 10) === value
  );
}
export async function readPersonal(userId) {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .download(userId + ".json");
  if (error) {
    if (
      String(error.statusCode || error.status) === "404" ||
      error.message === "Object not found"
    )
      return { manual: [], details: {} };
    throw error;
  }
  const raw = JSON.parse(await data.text());
  return {
    manual: Array.isArray(raw?.manual)
      ? raw.manual
          .filter((a) => a && /^manual-[0-9a-f-]{36}$/.test(a.id))
          .flatMap((a) => {
            try {
              return [validateManual(a, { id: a.id })];
            } catch {
              return [];
            }
          })
      : [],
    details:
      raw?.details &&
      typeof raw.details === "object" &&
      !Array.isArray(raw.details)
        ? raw.details
        : {},
  };
}
export async function changePersonal(userId, change) {
  const previous = queues.get(userId) || Promise.resolve();
  const operation = previous
    .catch(() => {})
    .then(async () => {
      const state = await readPersonal(userId);
      const result = await change(state);
      const body = JSON.stringify(state);
      if (Buffer.byteLength(body) > 262144)
        throw new AppError(400, "LIMIT", "개인 기록의 저장 용량을 초과했어요.");
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(userId + ".json", Buffer.from(body), {
          upsert: true,
          contentType: "application/json",
          cacheControl: "0",
        });
      if (error) throw error;
      return result;
    });
  queues.set(userId, operation);
  try {
    return await operation;
  } finally {
    if (queues.get(userId) === operation) queues.delete(userId);
  }
}
export function validateDetails(input) {
  const out = {};
  for (const key of ["applicationDeadline", "resultDate"])
    if (Object.hasOwn(input, key)) {
      if (input[key] && !validDate(input[key]))
        throw new AppError(400, "INVALID_DATE", "날짜를 확인해 주세요.");
      out[key] = input[key] || "";
    }
  if (Object.hasOwn(input, "resultDateUnknown")) {
    if (typeof input.resultDateUnknown !== "boolean")
      throw new AppError(
        400,
        "INVALID_DATE",
        "발표일 미정 여부를 확인해 주세요.",
      );
    out.resultDateUnknown = input.resultDateUnknown;
  }
  return out;
}
export function validateManual(input, existing) {
  const defaults = {
    id: "manual-" + randomUUID(),
    policyId: "",
    policyName: "",
    region: "직접 입력",
    category: "직접 입력",
    stage: "신청 준비",
    applicationDeadline: "",
    applicationDate: "",
    expectedResultDate: "",
    applicationNumber: "",
    reviewStatus: "접수 완료",
    memo: "",
    eligibilityChecks: [
      { label: "공식 공고의 자격조건 확인 필요", status: "needs_check" },
    ],
    requiredDocuments: [],
    resultStatus: "결과 대기",
    resultDate: "",
    nextActions: [],
  };
  const item = {
    ...defaults,
    ...Object.fromEntries(
      Object.keys(defaults)
        .filter((k) => Object.hasOwn(existing || {}, k))
        .map((k) => [k, existing[k]]),
    ),
  };
  for (const [key, limit] of [
    ["policyName", 200],
    ["applicationNumber", 200],
    ["memo", 5000],
  ])
    if (Object.hasOwn(input, key)) {
      if (typeof input[key] !== "string" || input[key].length > limit)
        throw new AppError(400, "INVALID_TEXT", "입력 내용을 확인해 주세요.");
      item[key] = input[key].trim();
    }
  if (!item.policyName)
    throw new AppError(400, "TITLE_REQUIRED", "혜택 이름을 입력해 주세요.");
  for (const [key, options] of [
    ["stage", ["신청 준비", "신청 완료", "결과 확인"]],
    ["reviewStatus", ["접수 완료", "심사 중", "결과 확인 필요", "종료"]],
    ["resultStatus", ["결과 대기", "선정", "미선정"]],
  ])
    if (Object.hasOwn(input, key)) {
      if (!options.includes(input[key]))
        throw new AppError(400, "INVALID_STATUS", "상태를 확인해 주세요.");
      item[key] = input[key];
    }
  for (const key of [
    "applicationDeadline",
    "applicationDate",
    "expectedResultDate",
    "resultDate",
  ])
    if (Object.hasOwn(input, key)) {
      if (
        input[key] &&
        !(key === "expectedResultDate" && input[key] === "미정") &&
        !validDate(input[key])
      )
        throw new AppError(400, "INVALID_DATE", "날짜를 확인해 주세요.");
      item[key] = input[key] || "";
    }
  if (Object.hasOwn(input, "requiredDocuments")) {
    const docs = input.requiredDocuments;
    if (
      !Array.isArray(docs) ||
      docs.length > 60 ||
      docs.some(
        (d) =>
          !d ||
          typeof d.name !== "string" ||
          !d.name.trim() ||
          d.name.length > 200 ||
          !["pending", "completed"].includes(d.status),
      )
    )
      throw new AppError(400, "INVALID_DOCUMENT", "준비물을 확인해 주세요.");
    item.requiredDocuments = docs.map((d) => ({
      name: d.name.trim(),
      description: "직접 추가한 준비물",
      custom: true,
      status: d.status,
    }));
  }
  if (Object.hasOwn(input, "nextActions")) {
    if (
      !Array.isArray(input.nextActions) ||
      input.nextActions.length > 30 ||
      input.nextActions.some(
        (x) => typeof x !== "string" || !x.trim() || x.length > 300,
      )
    )
      throw new AppError(400, "INVALID_TASKS", "후속 행동을 확인해 주세요.");
    item.nextActions = [...new Set(input.nextActions.map((x) => x.trim()))];
  }
  item.policyId = item.id;
  return item;
}
