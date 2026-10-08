import api from './axios';
export const listRoles = () => api.get('/roles');
export const createRole = (data) => api.post('/roles', data);
export const updateRole = (id, data) => api.put(`/roles/${id}`, data);
export const deleteRole = (id) => api.delete(`/roles/${id}`);
export const syncPermissions = (permissions) => api.post('/roles/sync-permissions', { permissions });
