import { z } from 'zod';

const integer = (fallback, min, max) => z.coerce.number().int().min(min).max(max).default(fallback);
const boolean = z.enum(['true', 'false']).transform(value => value === 'true');

export function loadConfig(env = process.env) {
  const result = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().min(1).default('127.0.0.1'),
    PORT: integer(3000, 1, 65535),
    APP_ORIGIN: z.url().default('http://localhost:3000'),
    SERVE_FRONTEND: boolean.default(true),
    MONGODB_URI: z.string().regex(/^mongodb(?:\+srv)?:\/\//),
    JWT_SECRET: z.string().min(48).refine(value => !/^(change|replace|example|your[-_])/i.test(value),
      'Generate a random secret of at least 48 characters'),
    JWT_TTL_SECONDS: integer(900, 60, 86400),
    BCRYPT_ROUNDS: integer(12, 10, 15),
    TRUST_PROXY_HOPS: integer(0, 0, 5),
    API_RATE_LIMIT: integer(300, 1, 100000),
    AUTH_RATE_LIMIT: integer(20, 1, 10000),
    QUERY_TIMEOUT_MS: integer(10000, 100, 60000),
    AUTO_INDEX: boolean.optional(),
  }).safeParse(env);
  if (!result.success) {

    throw new Error(`Invalid environment: ${result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  }
  const config = result.data;
  const origin = new URL(config.APP_ORIGIN);
  if (!['http:', 'https:'].includes(origin.protocol) || origin.origin !== config.APP_ORIGIN) {
    throw new Error('APP_ORIGIN must be an HTTP(S) origin without a path or trailing slash');
  }
  if (config.NODE_ENV === 'production' && origin.protocol !== 'https:') {
    throw new Error('APP_ORIGIN must use HTTPS in production');
  }
  config.AUTO_INDEX ??= config.NODE_ENV !== 'production';
  if (config.NODE_ENV === 'production' && config.AUTO_INDEX) {
    throw new Error('Set AUTO_INDEX=false in production; run npm run db:indexes separately');
  }
  return Object.freeze(config);
}
