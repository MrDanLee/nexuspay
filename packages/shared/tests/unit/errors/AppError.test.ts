import {
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  ExternalServiceError,
  InternalError,
} from '../../../src/errors/AppError';

describe('AppError classes', () => {
  describe('ValidationError', () => {
    it('should serialize with correct status and type', () => {
      const error = new ValidationError('Invalid input');
      const json = error.toJSON();

      expect(json.status).toBe(400);
      expect(json.type).toBe('https://nexuspay.dev/errors/validation');
      expect(json.title).toBe('Validation Error');
      expect(json.detail).toBe('Invalid input');
    });

    it('should include field-level errors when provided', () => {
      const error = new ValidationError('Invalid input', {
        fields: { email: 'Invalid email format', name: 'Required' },
      });
      const json = error.toJSON();

      expect(json.fields).toEqual({
        email: 'Invalid email format',
        name: 'Required',
      });
    });

    it('should be an instance of Error', () => {
      const error = new ValidationError('test');
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('AuthenticationError', () => {
    it('should serialize with 401 status', () => {
      const error = new AuthenticationError('Invalid token');
      const json = error.toJSON();

      expect(json.status).toBe(401);
      expect(json.type).toBe('https://nexuspay.dev/errors/authentication');
    });
  });

  describe('AuthorizationError', () => {
    it('should serialize with 403 status', () => {
      const error = new AuthorizationError('Insufficient permissions');
      const json = error.toJSON();

      expect(json.status).toBe(403);
      expect(json.type).toBe('https://nexuspay.dev/errors/authorization');
    });
  });

  describe('NotFoundError', () => {
    it('should serialize with 404 status and instance path', () => {
      const error = new NotFoundError('Order not found', {
        instance: '/api/v1/orders/abc-123',
      });
      const json = error.toJSON();

      expect(json.status).toBe(404);
      expect(json.instance).toBe('/api/v1/orders/abc-123');
    });
  });

  describe('ConflictError', () => {
    it('should serialize with 409 status', () => {
      const error = new ConflictError('Order already exists');
      const json = error.toJSON();

      expect(json.status).toBe(409);
      expect(json.type).toBe('https://nexuspay.dev/errors/conflict');
    });
  });

  describe('RateLimitError', () => {
    it('should serialize with 429 status and retryAfter', () => {
      const error = new RateLimitError('Too many requests', { retryAfter: 60 });
      const json = error.toJSON();

      expect(json.status).toBe(429);
      expect(json.retryAfter).toBe(60);
    });
  });

  describe('ExternalServiceError', () => {
    it('should serialize with 502 status', () => {
      const error = new ExternalServiceError('Payment gateway timeout');
      const json = error.toJSON();

      expect(json.status).toBe(502);
    });
  });

  describe('InternalError', () => {
    it('should serialize with 500 status', () => {
      const error = new InternalError();
      const json = error.toJSON();

      expect(json.status).toBe(500);
      expect(json.detail).toBe('An unexpected error occurred');
    });

    it('should not be operational', () => {
      const error = new InternalError('Database connection lost');
      expect(error.isOperational).toBe(false);
    });

    it('should preserve the original cause', () => {
      const cause = new Error('connection refused');
      const error = new InternalError('Database error', { cause });

      expect(error.cause).toBe(cause);
    });
  });

  describe('serialization', () => {
    it('should not include stack in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const error = new NotFoundError('Not found');
      const json = error.toJSON();

      expect(json.stack).toBeUndefined();

      process.env.NODE_ENV = originalEnv;
    });

    it('should include stack in development', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const error = new NotFoundError('Not found');
      const json = error.toJSON();

      expect(json.stack).toBeDefined();

      process.env.NODE_ENV = originalEnv;
    });

    it('should include metadata when provided', () => {
      const error = new ConflictError('Version mismatch', {
        metadata: { currentVersion: 3, providedVersion: 1 },
      });
      const json = error.toJSON();

      expect(json.metadata).toEqual({
        currentVersion: 3,
        providedVersion: 1,
      });
    });
  });
});