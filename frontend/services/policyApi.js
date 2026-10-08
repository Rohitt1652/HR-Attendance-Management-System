import api from './axios';

export const listPolicies = () => api.get('/policies');
export const getPendingPolicies = () => api.get('/policies/pending');
export const getPolicyAcceptanceReport = () => api.get('/policies/acceptance-report');
export const acceptPolicy = (id) => api.post(`/policies/${id}/accept`);
export const createPolicy = (data) => api.post('/policies', data);
export const updatePolicy = (id, data) => api.put(`/policies/${id}`, data);
export const deletePolicy = (id) => api.delete(`/policies/${id}`);

export function getPolicyFileUrl(policyId) {
  return `/api/policies/${policyId}/file`;
}
