import {
  Context,
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { emptyConditions, sameConditions } from "../data/conditions";

export type ApplicationStage = "신청 준비" | "신청 완료" | "결과 확인";
export type EligibilityStatus = "matched" | "unmatched" | "needs_check";
export type DocumentStatus = "completed" | "pending" | "needs_check";
export type ResultStatus = "결과 대기" | "선정" | "미선정";
export type ReviewStatus = "접수 완료" | "심사 중" | "결과 확인 필요" | "종료";

export type EligibilityCheck = {
  label: string;
  status: EligibilityStatus;
};

export type RequiredDocument = {
  name: string;
  description: string;
  status: DocumentStatus;
  guideUrl?: string;
  custom?: boolean;
};

export type ApplicationItem = {
  id: string;
  policyId: string;
  policyName: string;
  region: string;
  category: string;
  stage: ApplicationStage;
  applicationDeadline: string;
  applicationDate: string;
  expectedResultDate: string;
  // 결과 발표 하루 전 + 당일 알림 사용 여부
  resultNotificationEnabled?: boolean;
  applicationNumber: string;
  reviewStatus: ReviewStatus;
  memo: string;
  officialUrl?: string;
  eligibilityChecks: EligibilityCheck[];
  eligibilityOverall?: "신청 가능" | "신청 불가" | "확인 필요";
  requiredDocuments: RequiredDocument[];
  resultStatus: ResultStatus;
  resultDate: string;
  nextActions: string[];
  isExample?: boolean;
};

export type Profile = {
  birthDate?: string;
  name: string;
  age: string;
  region: string;
  status: string;
  interests: string[];
  interestDetails?: string[];
  housingType: string;
  specialTargets?: string[];
  employerType?: string;
  maritalStatus?: string;
  independentLiving?: string;
  housingBenefit?: string;
  education?: string;
  educationDetail?: string;
  statusDetail?: string;
  householdType?: string;
  homeOwnership?: string;
  headOfHousehold?: string;
};

export type NotificationSettings = {
  enabled: boolean;
  recommendations: boolean;
  policyAlerts: boolean;
  eventAlerts: boolean;
  facilityAlerts: boolean;
  deadlines: boolean;
  applicationUpdates: boolean;
  deadlineTiming: string;
  quietHours: boolean;
};

export type PolicySearchState = {
  query: string;
  categories: string[];
  categoryDetails?: string[];
  regions: string[];
  statuses: string[];
  facilityTypes: string[];
  dateStart: string;
  dateEnd: string;
  includeAlways: boolean;
  myConditionsOnly: boolean;
  sort: "추천순" | "마감 임박순" | "최신순";
};

export type TemporaryPolicyConditions = {
  birthDate?: string;
  age: string;
  education: string;
  educationDetail: string;
  currentStatus: string;
  statusDetail: string;
  interests: string[];
  interestDetails?: string[];
  housingType: string;
  householdType: string;
  homeOwnership: string;
  headOfHousehold: string;
  specialTargets: string[];
  employerType: string;
  maritalStatus: string;
  independentLiving: string;
  housingBenefit: string;
};

export type AppStateValue = {
  workspaceReady: boolean;
  message: string;
  busy: boolean;
  dismissMessage: () => void;
  savedPolicies: string[];
  recentPolicies: string[];
  applications: ApplicationItem[];
  profile: Profile;
  notificationSettings: NotificationSettings;
  policySearch: PolicySearchState;
  compareBaseId: string;
  compareSelectedId: string;
  compareSearchQuery: string;
  preparationChecks: Record<string, string[]>;
  recentSearchTerms: string[];
  temporaryPolicyConditions: TemporaryPolicyConditions;
  setProfile: (profile: Profile) => Promise<boolean | undefined>;
  setNotificationSettings: (
    settings:
      | NotificationSettings
      | ((current: NotificationSettings) => NotificationSettings),
  ) => void;
  toggleSaved: (title: string) => void;
  addRecent: (title: string) => void;
  clearRecent: () => void;
  addApplication: (
    item: Omit<ApplicationItem, "id">,
  ) => Promise<boolean | undefined>;
  updateApplication: (id: string, patch: Partial<ApplicationItem>) => Promise<boolean | undefined>;
  toggleApplicationDocument: (
    applicationId: string,
    documentName: string,
  ) => Promise<boolean | undefined>;
  setPolicySearch: (patch: Partial<PolicySearchState>) => void;
  setCompareBaseId: (id: string) => void;
  setCompareSelectedId: (id: string) => void;
  setCompareSearchQuery: (query: string) => void;
  togglePreparationCheck: (policyId: string, document: string) => void;
  addRecentSearchTerm: (term: string) => void;
  clearRecentSearchTerms: () => void;
  setTemporaryPolicyConditions: (conditions: TemporaryPolicyConditions) => void;
};

import { useWorkspaceState } from "./useWorkspaceState";
const AppStateContext = createContext<AppStateValue | null>(null);
export function AppStateProvider({ children }: { children: ReactNode }) {
  const state = useWorkspaceState();
  return (
    <AppStateContext.Provider value={state}>
      {children}
    </AppStateContext.Provider>
  );
}
export function useAppState() {
  const value = useContext(AppStateContext);
  if (!value) throw new Error("AppStateProvider missing");
  return value;
}
export function todayISO() {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}
export function formatDate(v: string) {
  return v.split("-").join(".");
}
