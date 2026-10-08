import api from './axios';

// Jobs
export const getJobs = (params) => api.get('/hiring/jobs', { params });
export const createJob = (data) => api.post('/hiring/jobs', data);
export const updateJob = (id, data) => api.put(`/hiring/jobs/${id}`, data);
export const deleteJob = (id) => api.delete(`/hiring/jobs/${id}`);

// Candidates
export const getCandidates = (params) => api.get('/hiring/candidates', { params });
export const createCandidate = (data) => api.post('/hiring/candidates', data);
export const updateCandidate = (id, data) => api.put(`/hiring/candidates/${id}`, data);
export const deleteCandidate = (id) => api.delete(`/hiring/candidates/${id}`);
export const uploadCandidateResume = (id, formData) => api.post(`/hiring/candidates/${id}/resume`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });

// Interviews
export const getInterviews = (params) => api.get('/hiring/interviews', { params });
export const scheduleInterview = (data) => api.post('/hiring/interviews', data);
export const updateInterview = (id, data) => api.put(`/hiring/interviews/${id}`, data);
export const deleteInterview = (id) => api.delete(`/hiring/interviews/${id}`);
