import axios, { AxiosError } from 'axios';

import { env } from '../config/env';
import { toApiError } from './errors';
import { mockAdapter } from './mock/mockAdapter';

let authToken: string | null = null;
let unauthorizedHandler: (() => void) | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

export function authHeaders(): Record<string, string> {
  return authToken ? { Authorization: `Bearer ${authToken}` } : {};
}

/** Registered by the auth store so a 401 anywhere signs the user out. */
export function onUnauthorized(handler: () => void) {
  unauthorizedHandler = handler;
}

export const http = axios.create({
  baseURL: env.apiBaseUrl,
  timeout: env.requestTimeoutMs,
  headers: { 'Content-Type': 'application/json' },
  adapter: env.useMockApi ? mockAdapter : undefined,
});

http.interceptors.request.use(config => {
  if (authToken) {
    config.headers.Authorization = `Bearer ${authToken}`;
  }
  return config;
});

http.interceptors.response.use(
  response => response,
  (error: AxiosError) => {
    const apiError = toApiError(error);
    const isAuthCall = error.config?.url?.startsWith('/auth/');
    if (apiError.code === 'UNAUTHORIZED' && !isAuthCall) {
      unauthorizedHandler?.();
    }
    return Promise.reject(apiError);
  },
);
