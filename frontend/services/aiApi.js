import api from './axios';

export const sendChatMessage = (message, history) => api.post('/ai/chat', { message, history });
export const parseLeaveRequest = (text) => api.post('/ai/parse-leave', { text });
export const generateReview = (data) => api.post('/ai/generate-review', data);
export const detectAnomalies = (params) => api.get('/ai/attendance-anomalies', { params });
export const generateJobDescription = (data) => api.post('/ai/generate-job-description', data);
export const generateAnnouncement = (data) => api.post('/ai/generate-announcement', data);
export const getExpenseInsights = (params) => api.get('/ai/expense-insights', { params });
export const parseExpense = (text) => api.post('/ai/parse-expense', { text });
export const getTaskInsights = () => api.get('/ai/task-insights');
export const parseTask = (text) => api.post('/ai/parse-task', { text });
