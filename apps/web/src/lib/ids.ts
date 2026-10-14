/** Random unique id for records created on this device. */
export function newId(): string {
  // randomUUID exists only in secure contexts (https, localhost); plain-http previews fall back.
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
