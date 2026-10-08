import api from './axios';

export const submitExpense = (data) => api.post('/expenses', data);
export const getMyExpenses = () => api.get('/expenses/my');
export const getAllExpenses = (params) => api.get('/expenses', { params });
export const getExpenseSummary = () => api.get('/expenses/summary');
export const approveExpense = (id) => api.put(`/expenses/${id}/approve`);
export const rejectExpense = (id, reason) => api.put(`/expenses/${id}/reject`, { reason });
export const markExpensePaid = (id) => api.put(`/expenses/${id}/mark-paid`);
export const deleteExpense = (id) => api.delete(`/expenses/${id}`);
