import api from './axios';
export const getEvents = (month, year) => {
  const params = {};
  if (month != null) params.month = month;
  if (year != null) params.year = year;
  return api.get('/calendar-events', { params });
};
export const createEvent = (data) => api.post('/calendar-events', data);
export const updateEvent = (id, data) => api.put(`/calendar-events/${id}`, data);
export const deleteEvent = (id) => api.delete(`/calendar-events/${id}`);
