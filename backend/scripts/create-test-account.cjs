// Explicitly invoked developer tool. Never run from a scheduled task or browser.
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const { createClient } = require("@supabase/supabase-js"),
  dotenv = require("dotenv");
const root = path.resolve(__dirname, "../.."),
  env = dotenv.parse(fs.readFileSync(path.join(root, "backend/.env"))),
  file = path.join(root, ".local/test-account.json");
(async () => {
  if (new URL(env.SUPABASE_URL).hostname !== "flkoszigqobfkztbvsyw.supabase.co")
    throw Error("Unexpected project; refusing account creation");
  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  if (fs.existsSync(file)) {
    const saved = JSON.parse(fs.readFileSync(file, "utf8"));
    const { data, error } = await admin.auth.admin.getUserById(saved.user_id);
    if (
      error ||
      data.user?.app_metadata?.test_account !== true ||
      data.user.email !== saved.email
    )
      throw Error(
        "Existing credential file does not identify this test account",
      );
    console.log(
      JSON.stringify({
        status: "EXISTS",
        email: saved.email,
        credentials: ".local/test-account.json",
      }),
    );
    return;
  }
  const email =
      "youthzip.test." +
      Date.now() +
      "." +
      crypto.randomBytes(3).toString("hex") +
      "@example.com",
    password = "Yz!" + crypto.randomBytes(15).toString("base64url") + "9a";
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: "테스트회원" },
    app_metadata: { test_account: true, test_purpose: "my-tab-integration" },
  });
  if (error) throw error;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    JSON.stringify(
      {
        email,
        password,
        user_id: data.user.id,
        project: "flkoszigqobfkztbvsyw",
        created_at: new Date().toISOString(),
        note: "개발 테스트 전용. 실제 개인정보를 입력하지 마세요.",
      },
      null,
      2,
    ),
    { flag: "wx" },
  );
  const login = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const auth = await login.auth.signInWithPassword({ email, password });
  if (auth.error) throw auth.error;
  await login.auth.signOut();
  console.log(
    JSON.stringify({
      status: "CREATED_LOGIN_VERIFIED",
      email,
      credentials: ".local/test-account.json",
    }),
  );
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
