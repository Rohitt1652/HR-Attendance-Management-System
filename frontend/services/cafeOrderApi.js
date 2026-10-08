import api from './axios';

export const placeOrder = (data) => api.post('/cafe-orders', data);
export const getMyOrders = () => api.get('/cafe-orders/my');
export const cancelOrder = (id, reason) => api.put(`/cafe-orders/${id}/cancel`, { reason });
export const submitPayment = (id, data) => api.post(`/cafe-orders/${id}/submit-payment`, data);

export const getAllOrders = (params) => api.get('/cafe-orders', { params });
export const updateOrderStatus = (id, status, cancelReason) => api.put(`/cafe-orders/${id}/status`, { status, cancelReason });
export const deleteCafeOrder = (id) => api.delete(`/cafe-orders/${id}`);
export const collectCafePayment = (id, data) => api.post(`/cafe-orders/${id}/payment`, data);
export const getCafePaymentSummary = (params) => api.get('/cafe-orders/summary/payments', { params });
