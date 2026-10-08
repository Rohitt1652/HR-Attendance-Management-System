import api from './axios';

export const applyLeave = (data) => api.post('/leaves', data);
export const getLeaveProofUrl = (id) => `/api/leaves/${id}/proof`;
export const getMyLeaves = (params) => api.get('/leaves/my', { params });
export const getAllLeaves = (params) => api.get('/leaves', { params });
export const approveLeave = (id) => api.put(`/leaves/${id}/approve`);
export const rejectLeave = (id, reason) => api.put(`/leaves/${id}/reject`, { reason });
export const getLeaveTypes = () => api.get('/leaves/types');
export const getMyBalance = (params) => api.get('/leaves/balance', { params });
export const getAllocations = () => api.get('/leaves/allocations');
export const updateAllocation = (data) => api.put('/leaves/allocations', data);
export const createLeaveType = (data) => api.post('/leaves/types', data);
export const updateLeaveType = (id, data) => api.put(`/leaves/types/${id}`, data);
export const deleteLeaveType = (id) => api.delete(`/leaves/types/${id}`);
export const getLeaveAnalytics = (params) => api.get('/leaves/analytics', { params });

export const deleteLeave = (id) => api.delete(`/leaves/${id}`);
export const editLeave = (id, data) => api.put(`/leaves/${id}`, data);
export const getLeaveSummary = (params) => api.get('/leaves/summary', { params });
