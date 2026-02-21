/**
 * Base error class for all application errors.
 *
 * Follows RFC 7807 (Problem Details for HTTP APIs) for consistent
 * error responses across all services. Every error serializes to:
 *
 * {
 *   "type": "https://nexuspay.dev/errors/not-found",
 *   "title": "Not Found",
 *   "status": 404,
 *   "detail": "Order with ID xyz was not found",
 *   "instance": "/api/v1/orders/xyz",
 *   "traceId": "abc-123"
 * }
 */
export abstract class AppError extends Error {
  abstract readonly statusCode: number;
  abstract readonly type: string;
  abstract readonly title: string;

  readonly isOperational: boolean;
  readonly detail: string;
  readonly instance?: string;
  readonly metadata?: Record<string, unknown>;

  constructor(
    detail: string,
    options?: {
      instance?: string;
      metadata?: Record<string, unknown>;
      cause?: Error;
    },
  ) {
    super(detail);
    this.name = this.constructor.name;
    this.detail = detail;
    this.isOperational = true;
    this.instance = options?.instance;
    this.metadata = options?.metadata;

    if (options?.cause) {
      this.cause = options.cause;
    }

    // Capture stack trace, excluding the constructor call
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Serialize to RFC 7807 Problem Details format.
   */
  toJSON(): Record<string, unknown> {
    const json: Record<string, unknown> = {
      type: this.type,
      title: this.title,
      status: this.statusCode,
      detail: this.detail,
    };

    if (this.instance) json.instance = this.instance;
    if (this.metadata) json.metadata = this.metadata;

    // Include stack trace only in development
    if (process.env.NODE_ENV === 'development') {
      json.stack = this.stack;
    }

    return json;
  }
}

// ─── Concrete Error Classes ────────────────────────────────────

export class ValidationError extends AppError {
  readonly statusCode = 400;
  readonly type = 'https://nexuspay.dev/errors/validation';
  readonly title = 'Validation Error';
  readonly fields?: Record<string, string>;

  constructor(
    detail: string,
    options?: {
      fields?: Record<string, string>;
      instance?: string;
      metadata?: Record<string, unknown>;
    },
  ) {
    super(detail, options);
    this.fields = options?.fields;
  }

  toJSON(): Record<string, unknown> {
    const json = super.toJSON();
    if (this.fields) json.fields = this.fields;
    return json;
  }
}

export class AuthenticationError extends AppError {
  readonly statusCode = 401;
  readonly type = 'https://nexuspay.dev/errors/authentication';
  readonly title = 'Authentication Required';
}

export class AuthorizationError extends AppError {
  readonly statusCode = 403;
  readonly type = 'https://nexuspay.dev/errors/authorization';
  readonly title = 'Forbidden';
}

export class NotFoundError extends AppError {
  readonly statusCode = 404;
  readonly type = 'https://nexuspay.dev/errors/not-found';
  readonly title = 'Not Found';
}

export class ConflictError extends AppError {
  readonly statusCode = 409;
  readonly type = 'https://nexuspay.dev/errors/conflict';
  readonly title = 'Conflict';
}

export class RateLimitError extends AppError {
  readonly statusCode = 429;
  readonly type = 'https://nexuspay.dev/errors/rate-limit';
  readonly title = 'Too Many Requests';
  readonly retryAfter?: number;

  constructor(
    detail: string,
    options?: {
      retryAfter?: number;
      instance?: string;
      metadata?: Record<string, unknown>;
    },
  ) {
    super(detail, options);
    this.retryAfter = options?.retryAfter;
  }

  toJSON(): Record<string, unknown> {
    const json = super.toJSON();
    if (this.retryAfter) json.retryAfter = this.retryAfter;
    return json;
  }
}

export class ExternalServiceError extends AppError {
  readonly statusCode = 502;
  readonly type = 'https://nexuspay.dev/errors/external-service';
  readonly title = 'External Service Error';
}

export class InternalError extends AppError {
  readonly statusCode = 500;
  readonly type = 'https://nexuspay.dev/errors/internal';
  readonly title = 'Internal Server Error';

  constructor(detail = 'An unexpected error occurred', options?: { cause?: Error }) {
    super(detail, options);
    // Internal errors are not operational — they indicate bugs
    (this as { isOperational: boolean }).isOperational = false;
  }
}