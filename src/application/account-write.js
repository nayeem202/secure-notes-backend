import { ApplicationError } from '../domain/application-error.js';
import { requireActor } from '../domain/policies.js';

export function createAccountWriter(transactions) {
  return (actor, work) => {
    requireActor(actor);
    return transactions.run(async repositories => {
      if (!await repositories.users.lockActive(actor)) {
        throw new ApplicationError('UNAUTHORIZED', 'Session is invalid or expired');
      }
      return work(repositories);
    });
  };
}
