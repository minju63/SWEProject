import { Router } from "express";
import { supabase as db } from "../lib/supabase.js";
import { requireAuth } from "../middlewares/auth.js";
import { ok, AppError } from "../utils/response.js";
import {
  readPersonal,
  changePersonal,
  validateManual,
  validateDetails,
  koreaToday,
} from "../services/my-workspace.service.js";

const router = Router();
router.use(requireAuth);
const uuid = (v) =>
  typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v,
  );
const checked = async (query) => {
  const { data, error } = await query;
  if (error) throw error;
  return data;
};
const policyFields =
  "policy_id,title,collection_domain,item_type,target_summary,support_content,income_condition,application_start_date,application_end_date,is_always_open,application_method,application_url,official_url,application_process,required_documents,eligibility_verified";
async function requirePolicy(id) {
  if (!uuid(id))
    throw new AppError(
      400,
      "INVALID_POLICY",
      "실제 등록된 정책을 선택해 주세요.",
    );
  const p = await checked(
    db.from("policy").select(policyFields).eq("policy_id", id).maybeSingle(),
  );
  if (!p)
    throw new AppError(404, "POLICY_NOT_FOUND", "정책을 찾을 수 없습니다.");
  return p;
}
router.get("/workspace", async (req, res) => {
  const uid = req.user.id;
  const [bookmarks, recent, applications, profile, documents] =
    await Promise.all([
      checked(
        db
          .from("user_bookmark")
          .select(`*,policy:policy_id(${policyFields})`)
          .eq("user_id", uid)
          .order("created_at", { ascending: false }),
      ),
      checked(
        db
          .from("user_recent_view")
          .select(`*,policy:policy_id(${policyFields})`)
          .eq("user_id", uid)
          .order("viewed_at", { ascending: false })
          .limit(5),
      ),
      checked(
        db
          .from("user_application")
          .select(`*,policy:policy_id(${policyFields})`)
          .eq("user_id", uid)
          .order("created_at", { ascending: false }),
      ),
      checked(
        db.from("user_profile").select("*").eq("user_id", uid).maybeSingle(),
      ),
      checked(db.from("user_document_check").select("*").eq("user_id", uid)),
    ]);
  const personal = await readPersonal(uid);
  // Reconcile due results on every authenticated workspace load, regardless of tab.
  for (const a of applications) {
    if (
      a.stage === "APPLIED" &&
      a.expected_result_date &&
      a.expected_result_date <= koreaToday()
    ) {
      const changed = await checked(
        db
          .from("user_application")
          .update({
            stage: "RESULT",
            apply_status: "NEED_CHECK",
            updated_at: new Date().toISOString(),
          })
          .eq("application_id", a.application_id)
          .eq("user_id", uid)
          .eq("stage", "APPLIED")
          .eq("expected_result_date", a.expected_result_date)
          .select("application_id,stage,apply_status")
          .maybeSingle(),
      );
      if (changed) {
        a.stage = changed.stage;
        a.apply_status = changed.apply_status;
      }
    }
  }
  const due = (a) =>
    a.stage === "신청 완료" &&
    a.expectedResultDate &&
    a.expectedResultDate !== "미정" &&
    a.expectedResultDate <= koreaToday();
  const manual = personal.manual.some(due)
    ? await changePersonal(uid, (state) => {
        state.manual = state.manual.map((a) =>
          due(a)
            ? { ...a, stage: "결과 확인", reviewStatus: "결과 확인 필요" }
            : a,
        );
        return state.manual;
      })
    : personal.manual;
  const tasks = applications.length
    ? await checked(
        db
          .from("user_followup_task")
          .select("*")
          .in(
            "application_id",
            applications.map((a) => a.application_id),
          )
          .order("sort_order"),
      )
    : [];
  ok(res, {
    bookmarks,
    recent,
    applications,
    profile,
    documents,
    tasks,
    manual,
    details: personal.details,
  });
});
router.post("/manual-applications", async (req, res) => {
  const item = validateManual(req.body);
  await changePersonal(req.user.id, (state) => {
    if (state.manual.length >= 100)
      throw new AppError(
        400,
        "LIMIT",
        "직접 입력은 100개까지 저장할 수 있어요.",
      );
    state.manual.unshift(item);
  });
  ok(res, item, 201);
});
router.patch("/manual-applications/:id", async (req, res) => {
  let item;
  await changePersonal(req.user.id, (state) => {
    const i = state.manual.findIndex((a) => a.id === req.params.id);
    if (i < 0)
      throw new AppError(
        404,
        "APPLICATION_NOT_FOUND",
        "신청 정보를 찾을 수 없습니다.",
      );
    item = validateManual(req.body, state.manual[i]);
    state.manual[i] = item;
  });
  ok(res, item);
});
router.put("/application-details/:id", async (req, res) => {
  const own = await checked(
    db
      .from("user_application")
      .select("application_id")
      .eq("application_id", req.params.id)
      .eq("user_id", req.user.id)
      .maybeSingle(),
  );
  if (!own)
    throw new AppError(
      404,
      "APPLICATION_NOT_FOUND",
      "신청 정보를 찾을 수 없습니다.",
    );
  const patch = validateDetails(req.body);
  await changePersonal(req.user.id, (state) => {
    state.details[req.params.id] = {
      ...state.details[req.params.id],
      ...patch,
    };
  });
  ok(res, patch);
});
router.delete("/account", async (req, res) => {
  if (req.body?.confirmation !== "탈퇴")
    throw new AppError(400, "CONFIRM_REQUIRED", "탈퇴 확인이 필요합니다.");
  const token = req.headers.authorization.replace(/^Bearer /, "");
  const signedOut = await db.auth.admin.signOut(token, "global");
  if (signedOut.error) throw signedOut.error;
  const removed = await db.storage
    .from("user-workspaces")
    .remove([req.user.id + ".json"]);
  if (removed.error) throw removed.error;
  const { error } = await db.auth.admin.deleteUser(req.user.id);
  if (error) throw error;
  ok(res, null);
});
router.post("/recent/:policyId", async (req, res) => {
  await requirePolicy(req.params.policyId);
  await checked(
    db.from("user_recent_view").upsert(
      {
        user_id: req.user.id,
        policy_id: req.params.policyId,
        viewed_at: new Date().toISOString(),
      },
      { onConflict: "user_id,policy_id" },
    ),
  );
  ok(res);
});
router.delete("/recent", async (req, res) => {
  await checked(
    db.from("user_recent_view").delete().eq("user_id", req.user.id),
  );
  ok(res);
});
router.post("/applications", async (req, res) => {
  const p = await requirePolicy(req.body.policyId);
  const existing = await checked(
    db
      .from("user_application")
      .select("application_id")
      .eq("user_id", req.user.id)
      .eq("policy_id", p.policy_id)
      .limit(1),
  );
  if (existing.length)
    throw new AppError(
      409,
      "ALREADY_MANAGED",
      "이미 신청 관리에 추가한 정책이에요.",
    );
  const data = await checked(
    db
      .from("user_application")
      .insert({
        user_id: req.user.id,
        policy_id: p.policy_id,
        stage: "PREPARING",
        added_from: "DETAIL",
      })
      .select()
      .single(),
  );
  ok(res, data, 201);
});
const stages = ["PREPARING", "APPLIED", "RESULT"],
  statuses = ["RECEIVED", "REVIEWING", "NEED_CHECK", "CLOSED"],
  results = ["WAITING", "SELECTED", "REJECTED"];
router.patch("/applications/:id", async (req, res) => {
  if (!uuid(req.params.id))
    throw new AppError(
      400,
      "INVALID_APPLICATION",
      "신청 정보를 확인해 주세요.",
    );
  const allowed = [
    "stage",
    "apply_status",
    "result",
    "applied_at",
    "receipt_no",
    "expected_result_date",
    "memo",
  ];
  const patch = {};
  for (const k of allowed)
    if (Object.hasOwn(req.body, k)) patch[k] = req.body[k];
  for (const [k, values] of [
    ["stage", stages],
    ["apply_status", statuses],
    ["result", results],
  ])
    if (patch[k] != null && !values.includes(patch[k]))
      throw new AppError(400, "INVALID_STATUS", "상태 값이 올바르지 않습니다.");
  for (const k of ["applied_at", "expected_result_date"])
    if (patch[k] != null) {
      const d = new Date(patch[k] + "T00:00:00Z");
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(patch[k]) ||
        !Number.isFinite(+d) ||
        d.toISOString().slice(0, 10) !== patch[k]
      )
        throw new AppError(400, "INVALID_DATE", "날짜를 확인해 주세요.");
    }
  for (const k of ["receipt_no", "memo"])
    if (
      patch[k] != null &&
      (typeof patch[k] !== "string" || patch[k].length > 5000)
    )
      throw new AppError(400, "INVALID_TEXT", "입력 내용을 확인해 주세요.");
  if (req.body.nextActions !== undefined) {
    if (
      !Array.isArray(req.body.nextActions) ||
      req.body.nextActions.length > 30 ||
      req.body.nextActions.some(
        (x) => typeof x !== "string" || !x.trim() || x.length > 300,
      )
    )
      throw new AppError(400, "INVALID_TASKS", "후속 행동을 확인해 주세요.");
  }
  const own = await checked(
    db
      .from("user_application")
      .select("application_id")
      .eq("application_id", req.params.id)
      .eq("user_id", req.user.id)
      .maybeSingle(),
  );
  if (!own)
    throw new AppError(
      404,
      "APPLICATION_NOT_FOUND",
      "신청 정보를 찾을 수 없습니다.",
    );
  const data = await checked(
    db
      .from("user_application")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("application_id", req.params.id)
      .eq("user_id", req.user.id)
      .select()
      .single(),
  );
  if (req.body.nextActions !== undefined) {
    const old = await checked(
      db
        .from("user_followup_task")
        .select("*")
        .eq("application_id", own.application_id),
    );
    const names = [...new Set(req.body.nextActions)];
    for (const t of old.filter((t) => !names.includes(t.title)))
      await checked(
        db
          .from("user_followup_task")
          .delete()
          .eq("task_id", t.task_id)
          .eq("application_id", own.application_id),
      );
    for (const [order, title] of names.entries())
      if (!old.some((t) => t.title === title))
        await checked(
          db.from("user_followup_task").insert({
            application_id: own.application_id,
            title,
            sort_order: order,
            is_default: false,
          }),
        );
  }
  ok(res, data);
});
router.put("/documents/:policyId", async (req, res) => {
  const p = await requirePolicy(req.params.policyId);
  const docs = Array.isArray(p.required_documents) ? p.required_documents : [];
  const doc = docs.find((d) => d.key === req.body.docKey);
  let custom = false;
  if (
    typeof req.body.docKey === "string" &&
    req.body.docKey.startsWith("custom:")
  ) {
    try {
      const name = decodeURIComponent(req.body.docKey.slice(7));
      custom = !!name.trim() && name.length <= 200;
    } catch {}
  }
  if ((!doc && !custom) || typeof req.body.isChecked !== "boolean")
    throw new AppError(
      400,
      "INVALID_DOCUMENT",
      "공식 준비물 항목을 확인해 주세요.",
    );
  await checked(
    db.from("user_document_check").upsert(
      {
        user_id: req.user.id,
        policy_id: p.policy_id,
        doc_key: doc?.key ?? req.body.docKey,
        is_checked: req.body.isChecked,
        checked_at: req.body.isChecked ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,policy_id,doc_key" },
    ),
  );
  ok(res);
});
router.delete("/documents/:policyId/:key", async (req, res) => {
  if (!uuid(req.params.policyId) || !req.params.key.startsWith("custom:"))
    throw new AppError(
      400,
      "INVALID_DOCUMENT",
      "직접 추가한 준비물만 삭제할 수 있어요.",
    );
  await checked(
    db
      .from("user_document_check")
      .delete()
      .eq("user_id", req.user.id)
      .eq("policy_id", req.params.policyId)
      .eq("doc_key", req.params.key),
  );
  ok(res);
});
export default router;
