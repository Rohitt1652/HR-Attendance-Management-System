import api from './axios';

export const listTasks = (params) => api.get('/office-tasks', { params });
export const getTask = (id) => api.get(`/office-tasks/${id}`);
export const createTask = (data) => api.post('/office-tasks', data);
export const updateTask = (id, data) => api.put(`/office-tasks/${id}`, data);
export const submitTaskExpense = (id, data) => api.post(`/office-tasks/${id}/submit-expense`, data);
export const approveTaskExpense = (id) => api.put(`/office-tasks/${id}/approve-expense`);
export const rejectTaskExpense = (id, reason) => api.put(`/office-tasks/${id}/reject-expense`, { reason });
export const deleteTask = (id) => api.delete(`/office-tasks/${id}`);
export const getTaskStats = () => api.get('/office-tasks/stats');
