import { useEffect, useRef, useState } from "react";
import { useAuth } from "../lib/auth";
import { personalApi } from "../lib/api";
import { supabase } from "../lib/auth";
import {
  policyCatalog,
  findPolicyByTitle,
  getRequiredDocuments,
  getRequiredDocumentItems,
} from "../data/policies";
import { mapHousingPolicy } from "../data/housing";
import { emptyConditions } from "../data/conditions";
import { busanRegions, regionCode } from "../data/regions";
import type {
  ApplicationItem,
  AppStateValue,
  Profile,
  PolicySearchState,
  TemporaryPolicyConditions,
  NotificationSettings,
} from "./AppState";
const defaults: Profile = {
  name: "회원",
  age: "",
  region: "",
  status: "",
  interests: [],
  housingType: "",
};
const stageToDb = {
  "신청 준비": "PREPARING",
  "신청 완료": "APPLIED",
  "결과 확인": "RESULT",
};
const reviewToDb = {
  "접수 완료": "RECEIVED",
  "심사 중": "REVIEWING",
  "결과 확인 필요": "NEED_CHECK",
  종료: "CLOSED",
};
const resultToDb = {
  "결과 대기": "WAITING",
  선정: "SELECTED",
  미선정: "REJECTED",
};
const isUuid = (id: string) =>
  /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(id);
function read<T>(key: string, fallback: T): T {
  try {
    const s = localStorage.getItem(key);
    return s ? JSON.parse(s) : fallback;
  } catch {
    return fallback;
  }
}
export function useWorkspaceState(): AppStateValue {
  const { user, requestLogin } = useAuth(),
    uid = useRef(user?.id);
  uid.current = user?.id;
  const account = useRef(user);
  account.current = user;
  const [savedPolicies, setSaved] = useState<string[]>([]),
    [recentPolicies, setRecent] = useState<string[]>([]),
    [applications, setApplications] = useState<ApplicationItem[]>([]),
    [profile, setProfileState] = useState<Profile>(defaults),
    [preparationChecks, setChecks] = useState<Record<string, string[]>>({}),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const writeLock = useRef(false);
  const mutationTail = useRef<Promise<boolean | undefined>>(
    Promise.resolve(undefined),
  );
  const [loadedOwner, setLoadedOwner] = useState<string | undefined>();
  // Queued writes must use the last completed read, not the render that queued them.
  const latest = useRef({ applications: [] as ApplicationItem[], saved: [] as string[], checks: {} as Record<string, string[]> });
  const [notificationSettings, setNotificationSettings] =
    useState<NotificationSettings>({
      enabled: false,
      recommendations: false,
      policyAlerts: false,
      eventAlerts: false,
      facilityAlerts: false,
      deadlines: false,
      applicationUpdates: false,
      deadlineTiming: "3일 전",
      quietHours: false,
    });
  const [policySearch, setSearch] = useState<PolicySearchState>(() =>
    read("youthzip-policy-search", {
      query: "",
      categories: [],
      regions: [],
      statuses: [],
      facilityTypes: [],
      dateStart: "",
      dateEnd: "",
      includeAlways: false,
      myConditionsOnly: false,
      sort: "추천순",
    }),
  );
  const [compareBaseId, setCompareBaseId] = useState(""),
    [compareSelectedId, setCompareSelectedId] = useState(""),
    [compareSearchQuery, setCompareSearchQuery] = useState(""),
    [recentSearchTerms, setTerms] = useState<string[]>([]),
    [temporaryPolicyConditions, setTemporaryPolicyConditions] =
      useState<TemporaryPolicyConditions>(emptyConditions);
  async function refresh(owner: string) {
    const s = await personalApi("/workspace");
    if (uid.current !== owner) return;
    const currentUser = account.current;
    for (const r of [...s.bookmarks, ...s.recent, ...s.applications])
      if (r.policy && !policyCatalog.some((p) => p.id === r.policy.policy_id))
        policyCatalog.push(mapHousingPolicy(r.policy));
    setSaved(s.bookmarks.map((r: any) => r.policy_id));
    latest.current.saved = s.bookmarks.map((r: any) => r.policy_id);
    setRecent(s.recent.slice(0, 5).map((r: any) => r.policy_id));
    const checks: Record<string, string[]> = {};
    for (const d of s.documents) {
      const p = policyCatalog.find((p) => p.id === d.policy_id);
      let docs: any = p?.required_documents ?? [];
      if (typeof docs === "string") {
        try {
          docs = JSON.parse(docs);
        } catch {
          docs = [];
        }
      }
      const name = d.doc_key.startsWith("custom:")
        ? decodeURIComponent(d.doc_key.slice(7))
        : docs.find((x: any) => x.key === d.doc_key)?.name;
      if (d.is_checked && name) (checks[d.policy_id] ??= []).push(name);
    }
    setChecks(checks);
    latest.current.checks = checks;
    const nextApplications: ApplicationItem[] = [
      ...s.applications.map((a: any) => {
        const p = policyCatalog.find((p) => p.id === a.policy_id);
        const extra = s.details?.[a.application_id] ?? {};
        return {
          id: a.application_id,
          policyId: a.policy_id,
          policyName: p?.title ?? a.policy?.title ?? "정책 확인 필요",
          category: p?.category ?? "정책",
          region: p?.region ?? "확인 필요",
          stage:
            (
              {
                PREPARING: "신청 준비",
                APPLIED: "신청 완료",
                RESULT: "결과 확인",
              } as any
            )[a.stage] ?? "신청 준비",
          applicationDeadline:
            extra.applicationDeadline || p?.applicationEndDate || "",
          applicationDate: a.applied_at ?? "",
          expectedResultDate:
            a.expected_result_date || (extra.resultDateUnknown ? "미정" : ""),
          applicationNumber: a.receipt_no ?? "",
          reviewStatus:
            (
              {
                RECEIVED: "접수 완료",
                REVIEWING: "심사 중",
                NEED_CHECK: "결과 확인 필요",
                CLOSED: "종료",
              } as any
            )[a.apply_status] ?? "접수 완료",
          memo: a.memo ?? "",
          officialUrl: p?.applicationUrl ?? p?.officialUrl,
          eligibilityChecks: [
            { label: "공식 공고의 자격조건 확인 필요", status: "needs_check" },
          ],
          requiredDocuments: [
            ...(p ? getRequiredDocuments(p) : []),
            ...s.documents
              .filter(
                (d: any) =>
                  d.policy_id === a.policy_id &&
                  d.doc_key.startsWith("custom:"),
              )
              .map((d: any) => decodeURIComponent(d.doc_key.slice(7))),
          ].map((name) => ({
            name,
            custom: !(p ? getRequiredDocuments(p) : []).includes(name),
            description:
              p &&
              getRequiredDocumentItems(p).find((d) => d.name === name)
                ?.required === false
                ? "해당자만 제출 · 본인에게 적용되는 조건인지 확인해주세요."
                : "공식 안내 확인 · 추가 서류나 제출 면제 기준은 공고를 확인해주세요.",
            status: checks[a.policy_id]?.includes(name)
              ? "completed"
              : "pending",
          })),
          resultStatus:
            (
              {
                WAITING: "결과 대기",
                SELECTED: "선정",
                REJECTED: "미선정",
              } as any
            )[a.result] ?? "결과 대기",
          resultDate: extra.resultDate || "",
          nextActions: s.tasks
            .filter((t: any) => t.application_id === a.application_id)
            .map((t: any) => t.title),
        };
      }),
      ...(s.manual ?? []),
    ];
    latest.current.applications = nextApplications;
    setApplications(nextApplications);
    const p = s.profile;
    if (p) {
      let age = "";
      if (p.birth_date) {
        const birth = new Date(p.birth_date),
          now = new Date();
        let years = now.getFullYear() - birth.getFullYear();
        if (
          now.getMonth() < birth.getMonth() ||
          (now.getMonth() === birth.getMonth() &&
            now.getDate() < birth.getDate())
        )
          years--;
        age = `만 ${years}세`;
      }
      setProfileState({
        ...defaults,
        ...(currentUser?.user_metadata?.profile_preferences ?? {}),
        name:
          currentUser?.user_metadata?.display_name ||
          currentUser?.email?.split("@")[0] ||
          "회원",
        birthDate: p.birth_date ?? "",
        age,
        region: busanRegions[p.region_code] ?? "",
        status: p.current_status?.[0] ?? "",
        interests: p.interest_categories ?? [],
        housingType: p.housing_type ?? "",
        education: p.final_education ?? "",
        householdType: p.household_type ?? "",
        homeOwnership: p.home_ownership ?? "",
        headOfHousehold: p.household_role ?? "",
        specialTargets: p.special_targets ?? [],
        maritalStatus: p.marital_status ?? "",
        independentLiving:
          p.lives_separately === true
            ? "부모와 별도 거주"
            : p.lives_separately === false
              ? "부모와 함께 거주"
              : "",
        housingBenefit: p.housing_benefit_status ?? "",
      });
    } else
      setProfileState({
        ...defaults,
        name:
          currentUser?.user_metadata?.display_name ||
          currentUser?.email?.split("@")[0] ||
          "회원",
      });
    setLoadedOwner(owner);
  }
  useEffect(() => {
    setSaved([]);
    setRecent([]);
    setApplications([]);
    setChecks({});
    latest.current = { applications: [], saved: [], checks: {} };
    setProfileState(defaults);
    setMessage("");
    setLoadedOwner(undefined);
    if (!user) return;
    const owner = user.id;
    setBusy(true);
    refresh(owner)
      .catch((e) => uid.current === owner && setMessage(e.message))
      .finally(() => uid.current === owner && setBusy(false));
  }, [user?.id]);
  useEffect(() => {
    if (!user) return;
    const owner = user.id;
    let day = new Date().toLocaleDateString("sv-SE", {
      timeZone: "Asia/Seoul",
    });
    const check = () => {
      const next = new Date().toLocaleDateString("sv-SE", {
        timeZone: "Asia/Seoul",
      });
      if (next !== day && !writeLock.current) {
        day = next;
        void refresh(owner).catch(
          (e) => uid.current === owner && setMessage(e.message),
        );
      }
    };
    const timer = window.setInterval(check, 60000);
    window.addEventListener("focus", check);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", check);
    };
  }, [user?.id]);
  async function mutate(action: () => Promise<unknown>) {
    if (!user) {
      requestLogin();
      return;
    }
    if (loadedOwner !== user.id) {
      setMessage("계정 데이터를 불러온 뒤 다시 시도해 주세요.");
      return;
    }
    const owner = user.id;
    const run = async () => {
      if (uid.current !== owner) return;
      writeLock.current = true;
      setBusy(true);
      setMessage("");
      try {
        await action();
        await refresh(owner);
        return true;
      } catch (e) {
        if (uid.current === owner)
          setMessage(
            e instanceof Error
              ? e.message
              : "저장하지 못했어요. 다시 시도해 주세요.",
          );
      } finally {
        writeLock.current = false;
        if (uid.current === owner) setBusy(false);
      }
    };
    const pending = mutationTail.current.catch(() => undefined).then(run);
    mutationTail.current = pending;
    return pending;
  }
  function resolve(value: string) {
    const p = findPolicyByTitle(value);
    if (!p || !isUuid(p.id))
      throw new Error(
        "아직 DB에 등록되지 않았어요. 실제 등록된 정책을 선택해 주세요.",
      );
    return p;
  }
  function applicationPatch(p: Partial<ApplicationItem>) {
    const body: any = {};
    if (p.stage) body.stage = stageToDb[p.stage];
    if (p.reviewStatus) body.apply_status = reviewToDb[p.reviewStatus];
    if (p.resultStatus) body.result = resultToDb[p.resultStatus];
    for (const [a, b] of [
      ["applicationDate", "applied_at"],
      ["expectedResultDate", "expected_result_date"],
      ["applicationNumber", "receipt_no"],
      ["memo", "memo"],
    ] as const)
      if (p[a] !== undefined) body[b] = p[a] === "미정" ? null : p[a] || null;
    if (p.nextActions) body.nextActions = p.nextActions;
    return body;
  }
  async function toggleDocument(policyId: string, name: string) {
    const p = resolve(policyId);
    let docs: any = p.required_documents ?? [];
    if (typeof docs === "string") docs = JSON.parse(docs);
    const key =
      docs.find((d: any) => d.name === name)?.key ??
      "custom:" + encodeURIComponent(name);
    if (!key) throw new Error("공식 준비물 항목이 아닙니다.");
    return personalApi("/documents/" + policyId, "PUT", {
      docKey: key,
      isChecked: !latest.current.checks[policyId]?.includes(name),
    });
  }
  return {
    workspaceReady: !!user && loadedOwner === user.id,
    savedPolicies: user && loadedOwner === user.id ? savedPolicies : [],
    recentPolicies: user && loadedOwner === user.id ? recentPolicies : [],
    applications: user && loadedOwner === user.id ? applications : [],
    profile: user && loadedOwner === user.id ? profile : defaults,
    preparationChecks: user && loadedOwner === user.id ? preparationChecks : {},
    notificationSettings,
    policySearch,
    compareBaseId,
    compareSelectedId,
    compareSearchQuery,
    recentSearchTerms,
    temporaryPolicyConditions,
    message,
    busy,
    dismissMessage: () => setMessage(""),
    setNotificationSettings,
    setProfile: (p) => {
      return mutate(async () => {
        await personalApi("/profile", "PUT", {
          birth_date: p.birthDate || null,
          region_code: regionCode(p.region),
          current_status: p.status ? [p.status] : [],
          interest_categories: p.interests,
          housing_type: p.housingType || null,
          final_education: p.education || null,
          household_type: p.householdType || null,
          home_ownership: p.homeOwnership || null,
          household_role: p.headOfHousehold || null,
          special_targets: p.specialTargets ?? [],
          marital_status: p.maritalStatus || null,
          lives_separately:
            p.independentLiving === "부모와 별도 거주"
              ? true
              : p.independentLiving === "부모와 함께 거주"
                ? false
                : null,
          housing_benefit_status: p.housingBenefit || null,
        });
        const { data, error } = await supabase.auth.updateUser({
          data: {
            display_name: p.name,
            profile_preferences: {
              educationDetail: p.educationDetail,
              statusDetail: p.statusDetail,
              employerType: p.employerType,
              interestDetails: p.interestDetails,
            },
          },
        });
        if (error) throw error;
        if (data.user && uid.current === data.user.id) account.current = data.user;
      });
    },
    toggleSaved: (value) => {
      void mutate(async () => {
        const p = resolve(value);
        return latest.current.saved.includes(p.id)
          ? personalApi("/bookmarks/" + p.id, "DELETE")
          : personalApi("/bookmarks", "POST", {
              policyId: p.id,
              savedFrom: "DETAIL",
            });
      });
    },
    addRecent: (value) => {
      if (!user) return;
      void mutate(() => personalApi("/recent/" + resolve(value).id, "POST"));
    },
    clearRecent: () => {
      void mutate(() => personalApi("/recent", "DELETE"));
    },
    addApplication: (item) => {
      return mutate(async () => {
        if (item.policyId.startsWith("manual-")) {
          await personalApi("/manual-applications", "POST", item);
          return;
        }
        const p = resolve(item.policyId);
        const a = await personalApi("/applications", "POST", {
          policyId: p.id,
        });
        const patch = applicationPatch(item);
        if (Object.keys(patch).length)
          await personalApi(
            "/applications/" + a.application_id,
            "PATCH",
            patch,
          );
        await personalApi("/application-details/" + a.application_id, "PUT", {
          applicationDeadline: item.applicationDeadline,
          resultDate: item.resultDate,
          resultDateUnknown: item.expectedResultDate === "미정",
        });
      });
    },
    updateApplication: (id, patch) => {
      return mutate(async () => {
        const a = latest.current.applications.find((a) => a.id === id);
        if (!a) throw new Error("신청 정보를 찾을 수 없어요.");
        if (id.startsWith("manual-")) {
          await personalApi("/manual-applications/" + id, "PATCH", patch);
          return;
        }
        if (patch.requiredDocuments) {
          const next = patch.requiredDocuments,
            old = a.requiredDocuments;
          for (const d of next.filter(
            (d) => d.custom && !old.some((o) => o.name === d.name),
          ))
            await personalApi("/documents/" + a.policyId, "PUT", {
              docKey: "custom:" + encodeURIComponent(d.name),
              isChecked: false,
            });
          for (const d of old.filter(
            (d) => d.custom && !next.some((n) => n.name === d.name),
          ))
            await personalApi(
              "/documents/" +
                a.policyId +
                "/" +
                encodeURIComponent("custom:" + encodeURIComponent(d.name)),
              "DELETE",
            );
        }
        const body = applicationPatch(patch);
        if (Object.keys(body).length)
          await personalApi("/applications/" + id, "PATCH", body);
        const details: any = {};
        if (patch.expectedResultDate !== undefined)
          details.resultDateUnknown = patch.expectedResultDate === "미정";
        if (patch.applicationDeadline !== undefined)
          details.applicationDeadline = patch.applicationDeadline;
        if (patch.resultDate !== undefined)
          details.resultDate = patch.resultDate;
        if (Object.keys(details).length)
          await personalApi("/application-details/" + id, "PUT", details);
      });
    },
    toggleApplicationDocument: (id, name) => {
      return mutate(() => {
        const a = latest.current.applications.find((a) => a.id === id);
        if (!a) throw new Error("신청 정보를 찾을 수 없어요.");
        return id.startsWith("manual-")
            ? personalApi("/manual-applications/" + id, "PATCH", {
                requiredDocuments: a.requiredDocuments.map((d) =>
                  d.name === name
                    ? {
                        ...d,
                        status:
                          d.status === "completed" ? "pending" : "completed",
                      }
                    : d,
                ),
              })
            : toggleDocument(a.policyId, name);
      });
    },
    togglePreparationCheck: (id, name) => {
      void mutate(() => toggleDocument(id, name));
    },
    setPolicySearch: (p) =>
      setSearch((v) => {
        const next = { ...v, ...p };
        localStorage.setItem("youthzip-policy-search", JSON.stringify(next));
        return next;
      }),
    setCompareBaseId,
    setCompareSelectedId,
    setCompareSearchQuery,
    setTemporaryPolicyConditions,
    addRecentSearchTerm: (term) =>
      setTerms((v) => [term, ...v.filter((t) => t !== term)].slice(0, 10)),
    clearRecentSearchTerms: () => setTerms([]),
  };
}
