import api from './axios';
export const getMyPayslips = () => api.get('/payslips/my');
export const listPayslips = (params) => api.get('/payslips', { params });
export const getPayslip = (id) => api.get(`/payslips/${id}`);
export const upsertPayslip = (data) => api.post('/payslips', data);
export const publishPayslip = (id) => api.put(`/payslips/${id}/publish`);
export const deletePayslip = (id) => api.delete(`/payslips/${id}`);
export const bulkGeneratePayslips = (data) => api.post('/payslips/bulk-generate', data);
export const downloadPayslipPdf = (id) => api.get(`/payslips/${id}/pdf`, { responseType: 'blob' });
