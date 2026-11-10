import { ApplicationError } from './application-error.js';

export function requireActor(actor) {
  if (!actor?._id) throw new ApplicationError('UNAUTHORIZED', 'Sign in to continue');
}

export function requireAdmin(actor) {
  requireActor(actor);
  if (actor.role !== 'admin') throw new ApplicationError('FORBIDDEN', 'Administrator access is required');
}

export function isSameUser(actor, id) {
  return String(actor._id).toLowerCase() === String(id).toLowerCase();
}

export function protectAdministrator(actor, id, changes) {
  if (isSameUser(actor, id) && (changes.role === 'user' || changes.isActive === false)) {
    throw new ApplicationError('SELF_PROTECTION', 'Administrators cannot demote or deactivate their own account');
  }
}
