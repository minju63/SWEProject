const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict"),
  crypto = require("node:crypto"),
  dotenv = require("dotenv"),
  { createClient } = require("@supabase/supabase-js");
const root = path.resolve(__dirname, "../.."),
  env = dotenv.parse(fs.readFileSync(path.join(root, "backend/.env"))),
  browser = dotenv.parse(fs.readFileSync(path.join(root, "frontend/.env"))),
  credentials = JSON.parse(
    fs.readFileSync(path.join(root, ".local/test-account.json")),
  );
(async () => {
  if (new URL(env.SUPABASE_URL).hostname !== "flkoszigqobfkztbvsyw.supabase.co")
    throw Error("Unexpected project");
  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
    client = createClient(env.SUPABASE_URL, browser.VITE_SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  const who = await admin.auth.admin.getUserById(credentials.user_id);
  assert.equal(who.data.user?.app_metadata.test_account, true);
  assert.equal(who.data.user.email, credentials.email);
  const login = await client.auth.signInWithPassword({
    email: credentials.email,
    password: credentials.password,
  });
  if (login.error) throw login.error;
  const token = login.data.session.access_token,
    base = "http://127.0.0.1:4000/api/v1",
    today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
  const api = async (url, method = "GET", body) => {
    const response = await fetch(base + "/me" + url, {
      method,
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await response.json();
    assert.equal(
      response.ok,
      true,
      JSON.stringify({ url, status: response.status, message: data.message }),
    );
    return data.data;
  };
  const policyHash = async () => {
    const { data, error } = await admin
      .from("policy")
      .select("*")
      .order("policy_id");
    if (error) throw error;
    return crypto
      .createHash("sha256")
      .update(JSON.stringify(data))
      .digest("hex");
  };
  const beforeHash = await policyHash();
  const publicResponse = await fetch(base + "/housing/policies"),
    policies = (await publicResponse.json()).data,
    p = policies.find((p) => p.required_documents?.length) || policies[0];
  let workspace = await api("/workspace"),
    a = workspace.applications.find((a) => a.policy_id === p.policy_id);
  if (!a) a = await api("/applications", "POST", { policyId: p.policy_id });
  await api("/applications/" + a.application_id, "PATCH", {
    stage: "APPLIED",
    applied_at: today,
    expected_result_date: null,
    memo: "[테스트] 실제 DB 신청관리 검증",
  });
  await api("/application-details/" + a.application_id, "PUT", {
    resultDateUnknown: true,
    resultDate: today,
    applicationDeadline: today,
  });
  workspace = await api("/workspace");
  assert.equal(
    workspace.applications.find((x) => x.application_id === a.application_id)
      .expected_result_date,
    null,
  );
  assert.equal(workspace.details[a.application_id].resultDateUnknown, true);
  await api("/applications/" + a.application_id, "PATCH", {
    expected_result_date: today,
  });
  await api("/application-details/" + a.application_id, "PUT", {
    resultDateUnknown: false,
  });
  workspace = await api("/workspace");
  assert.equal(
    workspace.applications.find((x) => x.application_id === a.application_id)
      .stage,
    "RESULT",
  );
  if (p.required_documents?.length) {
    await api("/documents/" + p.policy_id, "PUT", {
      docKey: p.required_documents[0].key,
      isChecked: true,
    });
    workspace = await api("/workspace");
    assert(
      workspace.documents.some(
        (d) => d.doc_key === p.required_documents[0].key && d.is_checked,
      ),
    );
  }
  await api("/bookmarks", "POST", {
    policyId: p.policy_id,
    savedFrom: "DETAIL",
  });
  const catalog=(await(await fetch(base+'/policy-catalog')).json()).data;
  for(const domain of ['JOB','HOUSING','FINANCE','CULTURE']){
    const sample=catalog.policies.find(row=>row.collection_domain===domain);assert(sample,'Missing domain '+domain);
    await api('/bookmarks','POST',{policyId:sample.policy_id,savedFrom:'DETAIL'});
    workspace=await api('/workspace');
    if(!workspace.applications.some(row=>row.policy_id===sample.policy_id))await api('/applications','POST',{policyId:sample.policy_id});
    workspace=await api('/workspace');assert(workspace.bookmarks.some(row=>row.policy_id===sample.policy_id));assert(workspace.applications.some(row=>row.policy_id===sample.policy_id&&row.user_id===credentials.user_id));
  }
  // Authenticated browser clients cannot bypass the owner-checked API.
  const deniedRead = await client.storage
    .from("user-workspaces")
    .download(credentials.user_id + ".json");
  assert(
    deniedRead.error,
    "Private workspace unexpectedly readable without server ownership check",
  );
  const deniedWrite = await client.storage
    .from("user-workspaces")
    .upload("access-test-" + credentials.user_id + ".json", "{}", {
      contentType: "application/json",
    });
  assert(deniedWrite.error, "Private workspace unexpectedly writable directly");
  const anonymous = await fetch(
    env.SUPABASE_URL +
      "/storage/v1/object/public/user-workspaces/" +
      credentials.user_id +
      ".json",
  );
  assert.equal(anonymous.ok, false);
  assert.equal((await fetch(base + "/me/workspace")).status, 401);
  assert.equal(await policyHash(), beforeHash, "Shared policy data changed");
  const result = {
    status: "VERIFIED",
    checked_at: new Date().toISOString(),
    account: credentials.email,
    registered_application_unknown_date: true,
    due_result_transition: true,
    preparation_check: true,
    private_storage_read_denied: true,
    private_storage_write_denied: true,
    anonymous_access_denied: true,
    shared_policy_unchanged: true,
    connected_domains:['JOB','HOUSING','FINANCE','CULTURE'],
  };
  fs.mkdirSync(path.join(root, "research/my_implementation_2026-11-17"), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(root, "research/my_implementation_2026-11-17/live_result.json"),
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
  // Sign out only this verification session; do not invalidate the UI session.
  await client.auth.signOut({ scope: "local" });
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
