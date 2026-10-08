import api from './axios';

export const listTeams = () => api.get('/fun-teams');
export const getTeam = (id) => api.get(`/fun-teams/${id}`);
export const createTeam = (formData) => api.post('/fun-teams', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
export const updateTeam = (id, formData) => api.put(`/fun-teams/${id}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
export const deleteTeam = (id) => api.delete(`/fun-teams/${id}`);
export const addMember = (id, userId) => api.post(`/fun-teams/${id}/members`, { userId });
export const removeMember = (id, userId) => api.delete(`/fun-teams/${id}/members/${userId}`);

// Events
export const addEvent = (id, formData) => api.post(`/fun-teams/${id}/events`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
export const updateEvent = (id, eventId, formData) => api.put(`/fun-teams/${id}/events/${eventId}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
export const deleteEvent = (id, eventId) => api.delete(`/fun-teams/${id}/events/${eventId}`);
