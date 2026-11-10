import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { authRoutes } from './routes/auth.routes.js';
import { noteRoutes } from './routes/note.routes.js';
import { postRoutes } from './routes/post.routes.js';
import { adminRoutes } from './routes/user.routes.js';
import { analyticsRoutes, publicUserRoutes } from './routes/aggregation.routes.js';
import { errorHandler, notFound } from './middleware/error-handler.js';
import { protectMutations } from './middleware/security.js';
import { allowFrontendOrigin } from './middleware/cors.js';
import { ApiError } from './api-error.js';
import { documentationRoutes } from './documentation/routes.js';

export function createHttpApp({ config, useCases, health, logger }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.TRUST_PROXY_HOPS || false);
  app.set('query parser', 'simple');
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: { 'upgrade-insecure-requests': config.NODE_ENV === 'production' ? [] : null },
      },
      strictTransportSecurity:
        config.NODE_ENV === 'production' ? { maxAge: 31536000, includeSubDomains: true } : false,
      referrerPolicy: { policy: 'same-origin' },
    }),
  );
  app.use((req, res, next) => {
    req.id = randomUUID();
    res.set('X-Request-Id', req.id);
    const start = performance.now();
    res.on('finish', () =>
      logger.info('http_request', {
        requestId: req.id,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs: Math.round(performance.now() - start),
      }),
    );
    next();
  });
  app.use(documentationRoutes(config));
  app.get('/health/live', (req, res) => res.json({ status: 'ok' }));
  app.get('/health/ready', async (req, res) => {
    const ready = await health();
    res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'unavailable' });
  });

  const makeLimiter = (limit, windowMs) =>
    rateLimit({
      limit,
      windowMs,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      handler: (req, res, next) =>
        next(new ApiError(429, 'RATE_LIMITED', 'Too many requests; try again later')),
    });
  const authLimiter = makeLimiter(config.AUTH_RATE_LIMIT, 15 * 60 * 1000);
  app.use(
    '/api',
    allowFrontendOrigin(config.APP_ORIGIN),
    (req, res, next) => {
      res.set('Cache-Control', 'no-store');
      next();
    },
    makeLimiter(config.API_RATE_LIMIT, 60 * 1000),
    protectMutations(config),
    express.json({ limit: '128kb', strict: true }),
  );
  const context = { config, useCases };
  app.use('/api/auth', authRoutes(context, authLimiter));
  app.use('/api/notes', noteRoutes(context));
  app.use('/api/posts', postRoutes(context));
  app.use('/api/admin/analytics', analyticsRoutes(context));
  app.use('/api/admin', adminRoutes(context));
  app.use('/api/users', publicUserRoutes(context));
  if (config.SERVE_FRONTEND) {
    app.use(
      express.static(fileURLToPath(new URL('../../../public', import.meta.url)), {
        dotfiles: 'deny',
        maxAge: 0,
      }),
    );
  }
  app.use(notFound);
  app.use(errorHandler(logger));
  return app;
}
