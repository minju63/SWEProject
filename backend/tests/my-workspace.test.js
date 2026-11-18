import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateManual,
  validateDetails,
  changePersonal,
  readPersonal,
  validDate,
} from "../src/services/my-workspace.service.js";
import { supabase } from "../src/lib/supabase.js";
test("manual records preserve dates, conditional state and custom preparation without accepting policy ownership", () => {
  const a = validateManual({
    policyName: "개인 혜택",
    policyId: "forged",
    user_id: "someone-else",
    expectedResultDate: "미정",
    officialUrl: "javascript:alert(1)",
    requiredDocuments: [{ name: "확인서", status: "completed" }],
  });
  assert.match(a.id, /^manual-/);
  assert.equal(a.policyId, a.id);
  assert.equal(a.expectedResultDate, "미정");
  assert.equal(a.requiredDocuments[0].custom, true);
  assert.equal(a.officialUrl, undefined);
  assert.equal(a.user_id, undefined);
  assert.throws(() => validateManual({ policyName: " ", stage: "신청 준비" }));
  assert.throws(() =>
    validateManual({ policyName: "x", expectedResultDate: "2026-02-30" }),
  );
  assert.throws(() =>
    validateManual({
      policyName: "x",
      requiredDocuments: [{ name: "서류", status: "forged" }],
    }),
  );
  assert.equal(validDate("2028-02-29"), true);
  assert.deepEqual(
    validateDetails({
      resultDateUnknown: true,
      applicationDeadline: "2026-11-17",
      user_id: "forged",
    }),
    { applicationDeadline: "2026-11-17", resultDateUnknown: true },
  );
  assert.throws(() => validateDetails({ resultDateUnknown: "true" }));
});
test("private workspace storage isolates owner paths and serializes overlapping changes", async () => {
  const old = supabase.storage.from,
    files = new Map();
  supabase.storage.from = (bucket) => {
    assert.equal(bucket, "user-workspaces");
    return {
      download: async (key) =>
        files.has(key)
          ? { data: new Blob([files.get(key)]) }
          : { error: { statusCode: 404 } },
      upload: async (key, body, opts) => {
        assert.equal(opts.upsert, true);
        files.set(key, body.toString());
        return { data: {} };
      },
    };
  };
  try {
    await Promise.all([
      changePersonal("owner-a", (s) =>
        s.manual.push(validateManual({ policyName: "A" })),
      ),
      changePersonal("owner-a", (s) =>
        s.manual.push(validateManual({ policyName: "B" })),
      ),
      changePersonal("owner-b", (s) =>
        s.manual.push(validateManual({ policyName: "C" })),
      ),
    ]);
    assert.deepEqual(
      (await readPersonal("owner-a")).manual.map((a) => a.policyName),
      ["A", "B"],
    );
    assert.equal((await readPersonal("owner-b")).manual[0].policyName, "C");
  } finally {
    supabase.storage.from = old;
  }
});
