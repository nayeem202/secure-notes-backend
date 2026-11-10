import { Router } from 'express';
import { createPost, deletePost, getPost, listPosts, updatePost } from '../controllers/post.controller.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { idParams, pageQuery, postCreateBody, postUpdateBody } from '../validation/schemas.js';

export function postRoutes(config) {
  const router = Router();
  router.get('/', validate({ query: pageQuery }), listPosts);
  router.get('/:id', validate({ params: idParams }), getPost);
  router.post('/', authenticate(config), validate({ body: postCreateBody }), createPost);
  router.patch('/:id', authenticate(config), validate({ params: idParams, body: postUpdateBody }), updatePost);
  router.delete('/:id', authenticate(config), validate({ params: idParams }), deletePost);
  return router;
}
