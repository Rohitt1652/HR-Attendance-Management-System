import api from './axios';
export const listEmployees = (params) => api.get('/employees', { params });
export const getTeamMembers = (params) => api.get('/employees/team', { params });
export const getEmployee = (id) => api.get(`/employees/${id}`);
export const createEmployee = (data) => api.post('/employees', data);
export const updateEmployee = (id, data) => api.put(`/employees/${id}`, data);
export const deleteEmployee = (id) => api.delete(`/employees/${id}`);
export const searchEmployees = (q) => api.get('/employees/search', { params: { q } });
export const uploadPhoto = (id, formData) =>
  api.post(`/employees/${id}/photo`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
export const uploadMyPhoto = (formData) =>
  api.post('/employees/me/photo', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
export const getTodayBirthdays = (params) => api.get('/employees/birthdays/today', { params });
export const getUpcomingBirthdays = () => api.get('/employees/birthdays/upcoming');
export const getMonthBirthdays = (month) => api.get(`/employees/birthdays/month/${month}`);
export const getMyTeam = () => api.get('/employees/my-team');
