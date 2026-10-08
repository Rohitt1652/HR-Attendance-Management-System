import api from './axios';
export const getMyNotifications = () => api.get('/notifications');
export const markAllRead = () => api.put('/notifications/read-all');
export const markOneRead = (id) => api.put(`/notifications/${id}/read`);
export const deleteNotification = (id) => api.delete(`/notifications/${id}`);
