import axios from 'axios';

export function isRequestOfflineError(error) {
  const status = error.response?.status;

  return !error.response && (
    error.code === 'ERR_NETWORK' ||
    error.code === 'ECONNABORTED' ||
    navigator.onLine === false ||
    status === 0
  );
}

const api = axios.create({
  baseURL: 'http://localhost:3001',
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
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const currentPath = window.location.pathname;

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