import { z } from 'zod';
import { MAX_OFFSET } from '../../../domain/pagination.js';

export const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Expected a 24-character MongoDB ObjectId');
const name = z.string().trim().min(2).max(80);
const email = z.string().trim().toLowerCase().max(254).pipe(z.email());
export const username = z.string().trim().toLowerCase().min(3).max(30).regex(
  /^[a-z0-9](?:[a-z0-9._-]{1,28}[a-z0-9])$/,
  'Use 3-30 letters, numbers, dots, hyphens, or underscores; start and end with a letter or number',
);
export const password = z.string().min(6).max(72)
  .refine(value => Buffer.byteLength(value, 'utf8') <= 72, 'Password must not exceed 72 UTF-8 bytes');
const interest = z.string().transform(value => value.normalize('NFKC').trim().toLowerCase())
  .pipe(z.string().min(1).max(40));
export const interests = z.array(interest).max(20).transform(value => [...new Set(value)]);

const positiveInt = max => z.string().regex(/^[1-9]\d*$/, 'Expected a positive integer')
  .transform(Number).pipe(z.number().int().min(1).max(max));
const pageShape = { page: positiveInt(100001).default(1), limit: positiveInt(100).default(10) };
const bounded = schema => schema.refine(value => (value.page - 1) * value.limit <= MAX_OFFSET,
  { message: `Pagination offset must not exceed ${MAX_OFFSET}`, path: ['page'] });
export const pageQuery = bounded(z.object(pageShape).strict());
export const interestQuery = bounded(z.object({
  ...pageShape, interest: interest.optional(),
  memberPage: positiveInt(100001).default(1),
  memberLimit: positiveInt(100).default(10),
}).strict()).refine(value => (value.memberPage - 1) * value.memberLimit <= MAX_OFFSET,
  { message: `Pagination offset must not exceed ${MAX_OFFSET}`, path: ['memberPage'] });
export const allNotesQuery = bounded(z.object({ ...pageShape, owner: username.optional() }).strict());
export const idParams = z.object({ id: objectId }).strict();
export const usernameParams = z.object({ username }).strict();

const nonemptyPatch = schema => schema.refine(value => Object.keys(value).length > 0, 'Provide at least one field');
export const registerBody = z.object({ name, username, email, password, interests: interests.default([]) }).strict();

export const loginBody = z.object({
  email: email.optional(), username: username.optional(), password: z.string().min(1).max(256),
}).strict().refine(value => Boolean(value.email) !== Boolean(value.username), 'Provide either email or username');
export const profileBody = nonemptyPatch(z.object({
  name: name.optional(), username: username.optional(), interests: interests.optional(),
}).strict());
export const passwordBody = z.object({ currentPassword: z.string().min(1).max(256), newPassword: password }).strict();
export const adminCreateBody = z.object({
  name, username, email, password, interests: interests.default([]), role: z.enum(['user', 'admin']).default('user'),
}).strict();
export const adminUpdateBody = nonemptyPatch(z.object({
  name: name.optional(), username: username.optional(), email: email.optional(), interests: interests.optional(),
  role: z.enum(['user', 'admin']).optional(), isActive: z.boolean().optional(), password: password.optional(),
}).strict());
const title = z.string().trim().min(1).max(160);
export const noteCreateBody = z.object({ title, content: z.string().max(20000).default('') }).strict();
export const noteUpdateBody = nonemptyPatch(z.object({ title: title.optional(), content: z.string().max(20000).optional() }).strict());
export const postCreateBody = z.object({ title, content: z.string().min(1).max(20000) }).strict();
export const postUpdateBody = nonemptyPatch(postCreateBody.partial());
