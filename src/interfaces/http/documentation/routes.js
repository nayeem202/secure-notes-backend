import { Router } from 'express';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import swaggerUi from 'swagger-ui-dist';
import { createOpenApi } from './openapi.js';

const assets = swaggerUi.getAbsoluteFSPath();
const initializer = fileURLToPath(new URL('./swagger-init.js', import.meta.url));
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Secure Notes API</title>
<link rel="icon" href="data:,">
<link rel="stylesheet" href="/docs/swagger-ui.css">
</head>
<body>
<div id="swagger-ui"></div>
<script src="/docs/swagger-ui-bundle.js" defer></script>
<script src="/docs/swagger-init.js" defer></script>
</body>
</html>`;

export function documentationRoutes(config) {
  const router = Router();
  router.get('/openapi.json', (req, res) => {
    res.set('Cache-Control', 'no-store').json(createOpenApi(config));
  });
  router.get(['/docs', '/docs/'], (req, res) => {
    res.set('Cache-Control', 'no-store').type('html').send(html);
  });
  for (const file of ['swagger-ui.css', 'swagger-ui-bundle.js']) {
    router.get(`/docs/${file}`, (req, res) => res.sendFile(resolve(assets, file)));
  }
  router.get('/docs/swagger-init.js', (req, res) => res.sendFile(initializer));
  return router;
}
