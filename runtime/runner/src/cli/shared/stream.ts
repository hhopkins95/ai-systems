
/**
 * Read all content from a ReadableStream as a string
 * Handles both string and Uint8Array chunks for cross-adapter compatibility
 */
export async function readStreamToString(
  stream: ReadableStream<string> | ReadableStream<Uint8Array>
): Promise<string> {
  const reader = stream.getReader();
  const chunks: (string | Uint8Array)[] = [];

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  // Check if we have Uint8Array chunks (need to decode)
  if (chunks.length > 0 && chunks[0] instanceof Uint8Array) {
    const decoder = new TextDecoder();
    return chunks.map(chunk => decoder.decode(chunk as Uint8Array, { stream: true })).join('');
  }

  // String chunks - just concatenate
  return chunks.join('');
}