import { Router } from 'express';
import { postController } from '../controllers/post.controller.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { idParams, pageQuery, postCreateBody, postUpdateBody } from '../validation/schemas.js';

export function postRoutes({ config, useCases }) {
  const router = Router();
  const controller = postController(useCases.posts);
  const signedIn = authenticate({ config, auth: useCases.auth });
  router.get('/', validate({ query: pageQuery }), controller.list);
  router.get('/:id', validate({ params: idParams }), controller.get);
  router.post('/', signedIn, validate({ body: postCreateBody }), controller.create);
  router.patch('/:id', signedIn, validate({ params: idParams, body: postUpdateBody }), controller.update);
  router.delete('/:id', signedIn, validate({ params: idParams }), controller.remove);
  return router;
}
