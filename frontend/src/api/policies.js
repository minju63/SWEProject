import { api } from './client';

export const fetchHealth = () => api.get('/health');
export const fetchCategories = () => api.get('/categories');
export const fetchSearchFilters = () => api.get('/search-filters');
export const fetchPolicies = (params) => api.get('/policies', { params });
export const fetchPolicySuggestions = (params, signal) =>
  api.get('/policies/suggestions', { params, signal });
export const fetchPolicy = (policyId) => api.get(`/policies/${policyId}`);
export const fetchPolicyExplanation = (policyId) => api.get(`/policies/${policyId}/explanation`);
export const fetchPolicyFollowup = (policyId, kind) =>
  api.get(`/policies/${policyId}/explanation/followup`, { params: { kind } });
export const fetchSimilarPolicies = (policyId, params) => api.get(`/policies/${policyId}/similar`, { params });
export const fetchPolicyComparison = (policyId, comparisonId) =>
  api.get(`/policies/${policyId}/compare/${comparisonId}`);
export const fetchAiCompareCandidates = (policyId) =>
  api.get(`/policies/${policyId}/compare-candidates`);
export const fetchAiComparisonSummary = (policyId, comparisonId) =>
  api.get(`/policies/${policyId}/compare/${comparisonId}/summary`);
export const recordPolicyView = (policyId) => api.post(`/policies/${policyId}/view`);
export const fetchEligibility = (policyId) => api.get(`/policies/${policyId}/eligibility`);
