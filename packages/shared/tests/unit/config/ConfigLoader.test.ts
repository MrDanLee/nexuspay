import { z } from 'zod';

import { ConfigLoader } from '../../../src/config/ConfigLoader';

describe('ConfigLoader', () => {
  describe('load', () => {
    it('should parse valid environment variables', () => {
      const schema = z.object({
        PORT: z.coerce.number().default(3000),
        HOST: z.string().default('localhost'),
      });

      const env = { PORT: '8080', HOST: 'example.com' };
      const config = ConfigLoader.load(schema, env);

      expect(config.PORT).toBe(8080);
      expect(config.HOST).toBe('example.com');
    });

    it('should apply default values for missing variables', () => {
      const schema = z.object({
        PORT: z.coerce.number().default(3000),
        HOST: z.string().default('localhost'),
      });

      const config = ConfigLoader.load(schema, {});

      expect(config.PORT).toBe(3000);
      expect(config.HOST).toBe('localhost');
    });

    it('should coerce string values to correct types', () => {
      const schema = z.object({
        PORT: z.coerce.number(),
        ENABLED: z.coerce.boolean(),
      });

      const env = { PORT: '3000', ENABLED: 'true' };
      const config = ConfigLoader.load(schema, env);

      expect(config.PORT).toBe(3000);
      expect(typeof config.PORT).toBe('number');
      expect(config.ENABLED).toBe(true);
      expect(typeof config.ENABLED).toBe('boolean');
    });

    it('should throw with descriptive error for missing required variables', () => {
      const schema = z.object({
        DATABASE_URL: z.string().url(),
        API_KEY: z.string().min(1),
      });

      expect(() => ConfigLoader.load(schema, {})).toThrow(
        'Configuration validation failed',
      );
    });

    it('should throw with descriptive error for invalid values', () => {
      const schema = z.object({
        PORT: z.coerce.number().min(1).max(65535),
      });

      const env = { PORT: '99999' };

      expect(() => ConfigLoader.load(schema, env)).toThrow(
        'Configuration validation failed',
      );
    });

    it('should list all invalid variables in error message', () => {
      const schema = z.object({
        DB_URL: z.string().url(),
        REDIS_URL: z.string().url(),
      });

      try {
        ConfigLoader.load(schema, { DB_URL: 'not-a-url', REDIS_URL: 'also-bad' });
        fail('Expected error to be thrown');
      } catch (error) {
        const message = (error as Error).message;
        expect(message).toContain('DB_URL');
        expect(message).toContain('REDIS_URL');
      }
    });

    it('should use process.env by default when no env parameter provided', () => {
      const originalEnv = process.env;
      process.env = { ...originalEnv, TEST_VAR: 'hello' };

      const schema = z.object({
        TEST_VAR: z.string(),
      });

      const config = ConfigLoader.load(schema);
      expect(config.TEST_VAR).toBe('hello');

      process.env = originalEnv;
    });
  });

  describe('tryLoad', () => {
    it('should return config on valid input', () => {
      const schema = z.object({
        PORT: z.coerce.number().default(3000),
      });

      const result = ConfigLoader.tryLoad(schema, { PORT: '8080' });

      expect(result).not.toBeNull();
      expect(result?.PORT).toBe(8080);
    });

    it('should return null on invalid input instead of throwing', () => {
      const schema = z.object({
        REQUIRED_VAR: z.string().min(1),
      });

      const result = ConfigLoader.tryLoad(schema, {});

      expect(result).toBeNull();
    });
  });
});