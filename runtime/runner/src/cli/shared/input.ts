/**
 * Read JSON input from stdin
 */
export async function readStdinJson<T>(): Promise<T> {
  const chunks: Buffer[] = [];

  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }

  const input = Buffer.concat(chunks).toString('utf-8');

  if (!input.trim()) {
    throw new Error('No input received via stdin');
  }

  return JSON.parse(input) as T;
}

