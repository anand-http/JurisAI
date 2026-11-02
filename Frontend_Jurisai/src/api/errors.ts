import axios from 'axios';

export type ApiErrorCode =
  | 'NETWORK'
  | 'TIMEOUT'
  | 'CANCELLED'
  | 'UNAUTHORIZED'
  | 'QUOTA_EXCEEDED'
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'UNAVAILABLE'
  | 'SERVER'
  | 'UNKNOWN';

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number | null;
  /** The backend's own code, e.g. "source_not_found". */
  readonly serverCode: string | null;

  constructor(
    code: ApiErrorCode,
    message: string,
    status: number | null,
    serverCode: string | null = null,
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.serverCode = serverCode;
  }

  get isOffline() {
    return this.code === 'NETWORK' || this.code === 'TIMEOUT';
  }
}

const STATUS_CODES: Record<number, ApiErrorCode> = {
  400: 'VALIDATION',
  401: 'UNAUTHORIZED',
  402: 'QUOTA_EXCEEDED',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'VALIDATION',
  429: 'RATE_LIMITED',
  503: 'UNAVAILABLE',
};

const FALLBACK_MESSAGES: Record<ApiErrorCode, string> = {
  NETWORK: 'No internet connection. Check your network and try again.',
  TIMEOUT: 'The server took too long to respond. Please try again.',
  CANCELLED: 'Request cancelled.',
  UNAUTHORIZED: 'Your session has expired. Please sign in again.',
  QUOTA_EXCEEDED: 'You have used all free drafts for this month.',
  NOT_FOUND: 'We could not find what you were looking for.',
  VALIDATION: 'Some details are invalid. Please review and try again.',
  CONFLICT: 'This action conflicts with the current state. Please refresh.',
  RATE_LIMITED: 'Too many requests. Please wait a few minutes and try again.',
  UNAVAILABLE: 'This service is temporarily unavailable.',
  SERVER: 'Something went wrong on our side. Please try again shortly.',
  UNKNOWN: 'Something went wrong. Please try again.',
};

interface ErrorBody {
  code?: string;
  message?: string;
  issues?: Array<{ path: string; message: string }>;
}

/** Converts anything thrown by axios (or our own code) into an ApiError. */
export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }
  if (axios.isCancel(error)) {
    return new ApiError('CANCELLED', FALLBACK_MESSAGES.CANCELLED, null);
  }
  if (axios.isAxiosError(error)) {
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return new ApiError('TIMEOUT', FALLBACK_MESSAGES.TIMEOUT, null);
    }
    if (!error.response) {
      return new ApiError('NETWORK', FALLBACK_MESSAGES.NETWORK, null);
    }
    const { status, data } = error.response;
    // Backend errors are { error: { code, message, ... } }.
    const body: ErrorBody =
      (data as { error?: ErrorBody })?.error ?? (data as ErrorBody) ?? {};
    const code = STATUS_CODES[status] ?? (status >= 500 ? 'SERVER' : 'UNKNOWN');
    const message =
      body.issues?.[0]?.message ??
      (status >= 500 ? undefined : body.message) ??
      FALLBACK_MESSAGES[code];
    return new ApiError(code, message, status, body.code ?? null);
  }
  const message = error instanceof Error ? error.message : String(error);
  return new ApiError('UNKNOWN', message || FALLBACK_MESSAGES.UNKNOWN, null);
}
