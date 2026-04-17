import axios from 'axios';
import { markOffline, markOnline } from './connectivityService';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export function isRequestOfflineError(error) {
  const status = error?.response?.status;
  const code = error?.code;
  const message = String(error?.message || '').toLowerCase();
  const browserOffline =
    typeof navigator !== 'undefined' ? navigator.onLine === false : false;

  return (
    !error?.response &&
    (
      code === 'ERR_NETWORK' ||
      code === 'ECONNABORTED' ||
      code === 'ETIMEDOUT' ||
      browserOffline ||
      status === 0 ||
      message.includes('network error') ||
      message.includes('timeout') ||
      message.includes('failed to fetch')
    )
  );
}

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
});

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('agrotask_token');

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => {
    markOnline('api-success');
    return response;
  },
  (error) => {
    const status = error.response?.status;
    const currentPath = window.location.pathname;

    if (isRequestOfflineError(error)) {
      markOffline('api-error');
    }

    if (status === 401 && currentPath !== '/') {
      localStorage.removeItem('agrotask_token');
      localStorage.removeItem('agrotask_user');
      localStorage.removeItem('agrotask_farm');
      localStorage.removeItem('agrotask_membership');

      window.location.href = '/';
    }

    return Promise.reject(error);
  }
);

export default api;