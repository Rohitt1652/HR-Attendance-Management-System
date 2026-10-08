import api from './axios';
export const getLeaveReport = (params) => api.get('/reports/leave', { params });
export const getDailyReport = (date) => api.get('/reports/daily', { params: { date } });
export const getMonthlyReport = (year, month) => api.get('/reports/monthly', { params: { year, month } });
export const getEmployeeReport = (id, params) => api.get(`/reports/employee/${id}`, { params });
export const getDepartmentReport = (params) => api.get('/reports/department', { params });
export const exportReport = (params) => api.get('/reports/export', { params, responseType: 'blob' });
