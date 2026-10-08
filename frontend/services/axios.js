import axios from 'axios';

const instance = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

instance.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    // Let the browser set multipart boundary for file uploads
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type'];
    }
  }
  return config;
}, (error) => Promise.reject(error));

instance.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      // Don't logout on change-password 401 (means wrong current password, not expired token)
      const url = error.config?.url || '';
      if (!url.includes('change-password')) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.dispatchEvent(new Event('auth:logout'));
      }
    }
    return Promise.reject(error);
  }
);

export default instance;
