// For scripts/setup.ts: an env file's text with AUTH_SECRET set to `secret` when it is missing or empty.
// Any value already there is kept, since changing it signs everyone out and breaks links already sent.
export function withAuthSecret(text: string, secret: string): string {
  const line = /^AUTH_SECRET=(.*)$/m.exec(text);
  if (!line) return `${text.replace(/\n?$/, '\n')}AUTH_SECRET=${secret}\n`;
  if (line[1].trim().replace(/^["']|["']$/g, '')) return text;
  return text.replace(/^AUTH_SECRET=.*$/m, `AUTH_SECRET=${secret}`);
}
