import { Router } from 'express';
import { noteController } from '../controllers/note.controller.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { idParams, noteCreateBody, noteUpdateBody, pageQuery } from '../validation/schemas.js';

export function noteRoutes({ config, useCases }) {
  const router = Router();
  const controller = noteController(useCases.notes);
  router.use(authenticate({ config, auth: useCases.auth }));
  router.get('/', validate({ query: pageQuery }), controller.listOwn);
  router.post('/', validate({ body: noteCreateBody }), controller.create);
  router.get('/:id', validate({ params: idParams }), controller.get);
  router.patch('/:id', validate({ params: idParams, body: noteUpdateBody }), controller.update);
  router.delete('/:id', validate({ params: idParams }), controller.remove);
  return router;
}
