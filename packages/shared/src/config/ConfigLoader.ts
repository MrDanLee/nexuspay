import { z, ZodSchema } from 'zod';

/**
 * Type-safe configuration loader with runtime validation.
 *
 * Uses Zod schemas to validate environment variables at startup,
 * ensuring the application fails fast with clear error messages
 * rather than crashing later with cryptic undefined errors.
 *
 * Usage:
 *   const schema = z.object({
 *     PORT: z.coerce.number().default(3000),
 *     DATABASE_URL: z.string().url(),
 *   });
 *
 *   const config = ConfigLoader.load(schema);
 *   // config is fully typed: { PORT: number; DATABASE_URL: string }
 */
export class ConfigLoader {
  /**
   * Load and validate configuration from environment variables.
   *
   * @param schema - Zod schema defining expected variables and types
   * @param env - Environment object (defaults to process.env)
   * @returns Validated and typed configuration object
   * @throws Error with details about missing or invalid variables
   */
  static load<T extends ZodSchema>(
    schema: T,
    env: Record<string, string | undefined> = process.env,
  ): z.infer<T> {
    const result = schema.safeParse(env);

    if (!result.success) {
      const errors = result.error.issues
        .map((issue) => {
          const path = issue.path.join('.');
          return `  - ${path}: ${issue.message}`;
        })
        .join('\n');

      throw new Error(
        `Configuration validation failed:\n${errors}\n\n` +
        `Check your .env file or environment variables.`,
      );
    }

    return result.data;
  }

  /**
   * Load configuration, returning null instead of throwing on failure.
   * Useful for optional configuration sections.
   */
  static tryLoad<T extends ZodSchema>(
    schema: T,
    env: Record<string, string | undefined> = process.env,
  ): z.infer<T> | null {
    const result = schema.safeParse(env);
    return result.success ? result.data : null;
  }
}