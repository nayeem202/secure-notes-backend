import { createContainer } from './bootstrap/container.js';
import { createHttpApp } from './interfaces/http/app.js';

export function createApp(config, options = {}) {
  const container = options.container ?? createContainer(config);
  return createHttpApp({
    config,
    useCases: container.useCases,
    health: container.health,
    logger: options.logger ?? container.logger,
  });
}
