import api from './axios';
export const getSettings = () => api.get('/settings');
export const updateSettings = (data) => api.put('/settings', data);
export const addHoliday = (data) => api.post('/settings/holidays', data);
export const removeHoliday = (date) => api.delete(`/settings/holidays/${date}`);

// Departments
export const getDepartments = () => api.get('/settings/departments');
export const addDepartment = (name, teamLeaderId) => api.post('/settings/departments', { name, teamLeaderId });
export const updateDepartment = (oldName, newName, teamLeaderId) => api.put('/settings/departments', { oldName, newName, teamLeaderId });
export const removeDepartment = (name) => api.delete(`/settings/departments/${encodeURIComponent(name)}`);
