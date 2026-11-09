import { api } from './client';

export const fetchHealth = () => api.get('/health');
export const fetchCategories = () => api.get('/categories');
export const fetchPolicies = (params) => api.get('/policies', { params });
export const fetchPolicy = (policyId) => api.get(`/policies/${policyId}`);
export const fetchEligibility = (policyId) => api.get(`/policies/${policyId}/eligibility`);
