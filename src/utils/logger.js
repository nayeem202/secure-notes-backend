function log(level, event, fields = {}) {
  process.stdout.write(`${JSON.stringify({ time: new Date().toISOString(), level, event, ...fields })}\n`);
}

export const logger = {
  info: (event, fields) => log('info', event, fields),
  error: (event, fields) => log('error', event, fields),
};
