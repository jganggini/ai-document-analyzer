import axios from 'axios';

export const baseURL = '/api';

const api = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  if (config.data instanceof FormData) {
    delete config.headers['Content-Type'];
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      const requestUrl = error?.config?.url ?? '';
      if (!requestUrl.includes('/auth/login')) {
        localStorage.removeItem('token');
        sessionStorage.removeItem('builder-last-flow-id');
        sessionStorage.removeItem('flow-builder-state');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
