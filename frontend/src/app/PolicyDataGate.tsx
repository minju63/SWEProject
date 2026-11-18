import { useEffect, useState, type ReactNode } from "react";
import { policyCatalog } from "../data/policies";
import { fetchPolicyCatalog } from "../data/catalog";

let initialLoad: Promise<void> | undefined;
function load() {
  return (initialLoad ??= fetchPolicyCatalog()
    .then((rows) => {
      policyCatalog.splice(0, policyCatalog.length, ...rows);
    })
    .catch((error) => {
      initialLoad = undefined;
      throw error;
    }));
}
export default function PolicyDataGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setState("loading");
    load()
      .then(() => active && setState("ready"))
      .catch(() => active && setState("error"));
    return () => {
      active = false;
    };
  }, [retry]);
  if (state !== "ready")
    return (
      <main className="mx-auto flex min-h-screen max-w-[480px] flex-col items-center justify-center gap-4 bg-white px-6 text-center">
        <h1 className="text-lg font-bold">청년ZIP</h1>
        <p role={state === "error" ? "alert" : "status"}>
          {state === "error"
            ? "정책 정보를 불러오지 못했어요."
            : "정책 정보를 불러오고 있어요."}
        </p>
        {state === "error" && (
          <button
            className="rounded-xl bg-[#2F7BF5] px-5 py-3 text-white"
            onClick={() => setRetry((n) => n + 1)}
          >
            다시 시도
          </button>
        )}
      </main>
    );
  return children;
}
