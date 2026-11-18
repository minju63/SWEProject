const fs = require("node:fs"),
  path = require("node:path"),
  { createClient } = require("@supabase/supabase-js"),
  dotenv = require("dotenv");
const env = dotenv.parse(fs.readFileSync(path.resolve(__dirname, "../.env")));
(async () => {
  if (new URL(env.SUPABASE_URL).hostname !== "flkoszigqobfkztbvsyw.supabase.co")
    throw Error("Unexpected project");
  const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  let { data, error } = await db.storage.getBucket("user-workspaces");
  if (!data) {
    if (error && !/not found/i.test(error.message)) throw error;
    const made = await db.storage.createBucket("user-workspaces", {
      public: false,
      fileSizeLimit: 262144,
      allowedMimeTypes: ["application/json"],
    });
    if (made.error) throw made.error;
    ({ data, error } = await db.storage.getBucket("user-workspaces"));
  }
  if (error) throw error;
  if (data.public !== false) throw Error("Workspace bucket must be private");
  console.log(
    JSON.stringify({
      bucket: data.id,
      public: data.public,
      status: "VERIFIED_PRIVATE",
    }),
  );
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
