export function toRecord(value) {
  if (value === null || value === undefined || typeof value !== 'object' || value instanceof Date)
    return value;
  if (value._bsontype === 'ObjectId') return value.toHexString();
  if (typeof value.toObject === 'function') return toRecord(value.toObject());
  if (Array.isArray(value)) return value.map(toRecord);
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, toRecord(entry)]));
}
