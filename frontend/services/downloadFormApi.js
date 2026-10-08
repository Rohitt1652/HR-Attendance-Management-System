import api from './axios';
export const listForms = () => api.get('/download-forms');
export const createForm = (formData) => api.post('/download-forms', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
export const updateForm = (id, formData) => api.put(`/download-forms/${id}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
export const deleteForm = (id) => api.delete(`/download-forms/${id}`);
export const trackDownload = (id) => api.post(`/download-forms/${id}/download`);
