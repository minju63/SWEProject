import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { supabase as db } from "../src/lib/supabase.js";
import workspace from "../src/routes/workspace.routes.js";
import { errorHandler } from "../src/middlewares/error.js";
test("personal routes authenticate and enforce ownership on reads, updates and deletes", async () => {
  const a = "11111111-1111-4111-8111-111111111111",
    b = "22222222-2222-4222-8222-222222222222",
    pa = "33333333-3333-4333-8333-333333333333",
    pb = "44444444-4444-4444-8444-444444444444",
    policy = "55555555-5555-4555-8555-555555555555";
  const tables = {
    user_bookmark: [{ user_id: a }, { user_id: b }],
    user_recent_view: [{ user_id: a }, { user_id: b }],
    user_application: [
      { application_id: pa, user_id: a, stage: "PREPARING" },
      { application_id: pb, user_id: b, stage: "PREPARING" },
    ],
    user_profile: [{ user_id: a }, { user_id: b }],
    user_document_check: [{ user_id: a }, { user_id: b }],
    user_followup_task: [
      { application_id: pa, title: "A" },
      { application_id: pb, title: "B" },
    ],
    policy: [
      { policy_id: policy, required_documents: [{ key: "d1", name: "등본" }] },
    ],
  };
  let reads = 0,
    deleted = false;
  const oldFrom = db.from,
    oldAuth = db.auth.getUser,
    oldStorage = db.storage.from,
    oldSignOut = db.auth.admin.signOut,
    oldDelete = db.auth.admin.deleteUser;
  let stored = null;
  db.storage.from = (bucket) => {
    assert.equal(bucket, "user-workspaces");
    return {
      download: async (key) => {
        assert.equal(key, a + ".json");
        return stored
          ? { data: new Blob([stored]) }
          : { error: { statusCode: "404" } };
      },
      upload: async (key, body) => {
        assert.equal(key, a + ".json");
        stored = body.toString();
        return { data: {} };
      },
      remove: async (keys) => {
        assert.deepEqual(keys, [a + ".json"]);
        stored = null;
        return { data: [] };
      },
    };
  };
  db.auth.admin.signOut = async (token, scope) => {
    assert.equal(token, "valid");
    assert.equal(scope, "global");
    return { error: null };
  };
  db.auth.admin.deleteUser = async (id) => {
    assert.equal(id, a);
    deleted = true;
    return { error: null };
  };
  db.auth.getUser = async (token) =>
    token === "valid" && !deleted
      ? { data: { user: { id: a } } }
      : { data: { user: null }, error: { message: "invalid" } };
  db.from = (table) => {
    const filters = [];
    let action = "select",
      body,
      one = false;
    const q = {
      select() {
        return q;
      },
      order() {
        return q;
      },
      limit() {
        return q;
      },
      eq(k, v) {
        filters.push((r) => r[k] === v);
        return q;
      },
      in(k, vs) {
        filters.push((r) => vs.includes(r[k]));
        return q;
      },
      maybeSingle() {
        one = true;
        return q;
      },
      single() {
        one = true;
        return q;
      },
      update(v) {
        action = "update";
        body = v;
        return q;
      },
      delete() {
        action = "delete";
        return q;
      },
      insert(v) {
        action = "insert";
        body = v;
        return q;
      },
      upsert(v) {
        action = "insert";
        body = v;
        return q;
      },
      then(resolve, reject) {
        try {
          reads++;
          let rows = tables[table].filter((r) => filters.every((f) => f(r)));
          if (action === "update") rows.forEach((r) => Object.assign(r, body));
          if (action === "delete")
            tables[table] = tables[table].filter((r) => !rows.includes(r));
          if (action === "insert") {
            tables[table].push(body);
            rows = [body];
          }
          return Promise.resolve({
            data: structuredClone(one ? (rows[0] ?? null) : rows),
            error: null,
          }).then(resolve, reject);
        } catch (e) {
          return Promise.reject(e).then(resolve, reject);
        }
      },
    };
    return q;
  };
  const app = express();
  app.use(express.json());
  app.use("/me", workspace);
  app.use(errorHandler);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const url = "http://127.0.0.1:" + server.address().port;
  const request = (p, method = "GET", body, token = "valid") =>
    fetch(url + "/me" + p, {
      method,
      headers: {
        Authorization: token ? "Bearer " + token : "",
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  try {
    assert.equal(
      (await request("/workspace", "GET", undefined, "")).status,
      401,
    );
    assert.equal(reads, 0);
    assert.equal(
      (await request("/workspace", "GET", undefined, "forged")).status,
      401,
    );
    assert.equal(reads, 0);
    let r = await request("/workspace"),
      s = (await r.json()).data;
    assert.equal(s.bookmarks.length, 1);
    assert.equal(s.bookmarks[0].user_id, a);
    assert.equal(s.tasks.length, 1);
    assert.equal(s.tasks[0].title, "A");
    assert.equal(
      (await request("/applications/" + pb, "PATCH", { stage: "RESULT" }))
        .status,
      404,
    );
    assert.equal(tables.user_application[1].stage, "PREPARING");
    r = await request("/applications/" + pa, "PATCH", {
      stage: "APPLIED",
      user_id: b,
    });
    assert.equal(r.status, 200);
    assert.equal(tables.user_application[0].user_id, a);
    assert.equal(tables.user_application[0].stage, "APPLIED");
    assert.equal(
      (
        await request("/applications/" + pa, "PATCH", {
          expected_result_date: "2026-02-30",
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await request("/applications/" + pa, "PATCH", {
          expected_result_date: null,
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await request("/application-details/" + pb, "PUT", {
          resultDateUnknown: true,
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await request("/application-details/" + pa, "PUT", {
          resultDateUnknown: true,
        })
      ).status,
      200,
    );
    r = await request("/manual-applications", "POST", {
      policyName: "직접 입력 테스트",
      stage: "신청 완료",
      expectedResultDate: "미정",
      memo: "개인 기록",
    });
    assert.equal(r.status, 201);
    const manual = (await r.json()).data;
    assert.equal(
      (
        await request("/manual-applications/manual-missing", "PATCH", {
          memo: "cannot change",
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await request("/manual-applications/" + manual.id, "PATCH", {
          expectedResultDate: "2026-02-30",
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await request("/manual-applications/" + manual.id, "PATCH", {
          requiredDocuments: [{ name: "추가 준비물", status: "completed" }],
        })
      ).status,
      200,
    );
    s = (await (await request("/workspace")).json()).data;
    assert.equal(s.manual.length, 1);
    assert.equal(s.manual[0].requiredDocuments[0].status, "completed");
    assert.equal(s.details[pa].resultDateUnknown, true);
    assert.equal(
      (
        await request("/applications/" + pa, "PATCH", {
          stage: "RESULT",
          nextActions: [null],
        })
      ).status,
      400,
    );
    assert.equal(tables.user_application[0].stage, "APPLIED");
    assert.equal(
      (
        await request("/documents/" + policy, "PUT", {
          docKey: "missing",
          isChecked: true,
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await request("/documents/" + policy, "PUT", {
          docKey: "d1",
          isChecked: true,
          user_id: b,
        })
      ).status,
      200,
    );
    assert.equal(tables.user_document_check.at(-1).user_id, a);
    await request("/recent", "DELETE");
    assert.deepEqual(tables.user_recent_view, [{ user_id: b }]);
    assert.equal(
      (await request("/account", "DELETE", { confirmation: "no" })).status,
      400,
    );
    assert.equal(deleted, false);
    assert.equal(
      (
        await request("/account", "DELETE", {
          confirmation: "탈퇴",
          user_id: b,
        })
      ).status,
      200,
    );
    assert.equal(deleted, true);
    assert.equal(stored, null);
    assert.equal((await request("/workspace")).status, 401);
  } finally {
    await new Promise((r) => server.close(r));
    db.from = oldFrom;
    db.auth.getUser = oldAuth;
    db.storage.from = oldStorage;
    db.auth.admin.signOut = oldSignOut;
    db.auth.admin.deleteUser = oldDelete;
  }
});
