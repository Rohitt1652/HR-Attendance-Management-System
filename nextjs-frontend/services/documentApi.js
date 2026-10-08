import api from './axios';

export const getMyDocuments = () => api.get('/documents/my');
export const getEmployeeDocuments = (employeeId) => api.get(`/documents/employee/${employeeId}`);
export const getAllDocuments = (params) => api.get('/documents/all', { params });
export const uploadMyDocument = (formData) => api.post('/documents/my', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
export const uploadMyDocumentsMultiple = (formData) => api.post('/documents/my/multiple', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
export const uploadForEmployee = (employeeId, formData) => api.post(`/documents/employee/${employeeId}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
export const uploadForEmployeeMultiple = (employeeId, formData) => api.post(`/documents/employee/${employeeId}/multiple`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
export const verifyDocument = (id) => api.put(`/documents/${id}/verify`);
export const rejectDocument = (id, reason) => api.put(`/documents/${id}/reject`, { reason });
export const deleteDocument = (id) => api.delete(`/documents/${id}`);
