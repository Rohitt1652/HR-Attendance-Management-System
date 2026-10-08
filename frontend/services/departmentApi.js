import api from './axios';

export const listDepartments = (params) => api.get('/departments', { params });
export const getDepartment = (id) => api.get(`/departments/${id}`);
export const createDepartment = (data) => api.post('/departments', data);
export const updateDepartment = (id, data) => api.put(`/departments/${id}`, data);
export const updateDepartmentStatus = (id, status) => api.patch(`/departments/${id}/status`, { status });
export const deleteDepartment = (id) => api.delete(`/departments/${id}`);
export const getDepartmentNames = () => api.get('/departments/names');
