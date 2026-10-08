import api from './axios';

export const getAllMenus = () => api.get('/cafe-menu');
export const getTodayMenu = (date) => api.get('/cafe-menu/today', { params: date ? { date } : {} });
export const getCafeConfig = () => api.get('/cafe-menu/config');
export const updateCafeConfig = (data) => api.put('/cafe-menu/config', data);
export const getDayMenu = (day) => api.get(`/cafe-menu/${day}`);
export const updateDayMenu = (day, data) => api.put(`/cafe-menu/${day}`, data);
export const addItem = (day, data) => api.post(`/cafe-menu/${day}/items`, data);
export const updateItem = (day, itemId, data) => api.put(`/cafe-menu/${day}/items/${itemId}`, data);
export const deleteItem = (day, itemId) => api.delete(`/cafe-menu/${day}/items/${itemId}`);

// PDF upload — proxied via /api route handler (no direct cross-origin call)
export const parsePdfMenu = async (formData) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  const response = await fetch('/api/cafe-menu/parse-pdf', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  const data = await response.json();
  if (!response.ok) {
    const err = new Error(data.message || 'Upload failed');
    err.response = { status: response.status, data };
    throw err;
  }
  return { data };
};

export const importParsedMenu = (data) => api.post('/cafe-menu/import-parsed', data);
export const syncItemImages = (itemName) => api.post('/cafe-menu/sync/images', { itemName });
