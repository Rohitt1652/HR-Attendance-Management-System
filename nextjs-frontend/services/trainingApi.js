import api from './axios';

export const getTrainings = (params) => api.get('/training', { params });
export const createTraining = (data) => api.post('/training', data);
export const updateTraining = (id, data) => api.put(`/training/${id}`, data);
export const deleteTraining = (id) => api.delete(`/training/${id}`);

export const getEnrollments = (params) => api.get('/training/enrollments', { params });
export const getMyEnrollments = () => api.get('/training/my-enrollments');
export const enrollUser = (data) => api.post('/training/enroll', data);
export const updateEnrollment = (id, data) => api.put(`/training/enrollments/${id}`, data);
export const collectTrainingPayment = (id, data) => api.post(`/training/enrollments/${id}/payment`, data);
export const getTrainingPaymentSummary = (trainingId) => api.get(`/training/${trainingId}/payment-summary`);
