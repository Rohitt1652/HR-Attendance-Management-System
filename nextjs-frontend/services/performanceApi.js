import api from './axios';
export const getMyReviews = () => api.get('/performance/my');
export const listReviews = (params) => api.get('/performance', { params });
export const getReview = (id) => api.get(`/performance/${id}`);
export const upsertReview = (data) => api.post('/performance', data);
export const publishReview = (id) => api.put(`/performance/${id}/publish`);
export const deleteReview = (id) => api.delete(`/performance/${id}`);
export const getTeamSummary = (params) => api.get('/performance/summary', { params });
export const getReviewableEmployees = () => api.get('/performance/reviewable-employees');
