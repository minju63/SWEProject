import { api } from './client';

export const fetchProfile = () => api.get('/me/profile');
export const updateProfile = (profile) => api.put('/me/profile', profile);
export const fetchBookmarks = () => api.get('/me/bookmarks');
export const addBookmark = (policyId, savedFrom) =>
  api.post('/me/bookmarks', { policyId, savedFrom });
export const removeBookmark = (policyId) => api.delete(`/me/bookmarks/${policyId}`);
