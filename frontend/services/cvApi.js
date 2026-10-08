import api from './axios';

export const getMyCV = () => api.get('/cv/my');
export const updateMyCV = (data) => api.put('/cv/my', data);
export const uploadCVFile = (formData) => api.post('/cv/my/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
export const getAllCVs = () => api.get('/cv');
export const getCVById = (id) => api.get(`/cv/${id}`);
