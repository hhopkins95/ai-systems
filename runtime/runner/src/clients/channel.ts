/**
 * Message channel for bridging push-based producers with pull-based consumers.
 *
 * This enables the CLI to read streaming input from stdin and feed it to
 * core functions that accept AsyncIterable.
 */

export interface MessageChannel<T> {
  /** Push a value into the channel (non-blocking) */
  send(value: T): void;
  /** Signal end of stream */
  close(): void;
  /** Pull values as an async generator */
  receive(): AsyncGenerator<T>;
}

/**
 * Create a message channel for streaming values between producers and consumers.
 *
 * Usage:
 * ```typescript
 * const channel = createMessageChannel<UserMessage>();
 *
 * // Producer (can push anytime)
 * channel.send({ role: 'user', content: 'Hello' });
 * channel.close();
 *
 * // Consumer (pulls values)
 * for await (const msg of channel.receive()) {
 *   console.log(msg);
 * }
 * ```
 */
export function createMessageChannel<T>(): MessageChannel<T> {
  const queue: T[] = [];
  const waiters: Array<(result: IteratorResult<T>) => void> = [];
  let closed = false;

  return {
    send(value: T) {
      if (closed) return;
      if (waiters.length > 0) {
        waiters.shift()!({ value, done: false });
      } else {
        queue.push(value);
      }
    },

    close() {
      closed = true;
      while (waiters.length) {
        waiters.shift()!({ value: undefined as T, done: true });
      }
    },

    async *receive(): AsyncGenerator<T> {
      while (true) {
        if (queue.length > 0) {
          yield queue.shift()!;
        } else if (closed) {
          return;
        } else {
          const result = await new Promise<IteratorResult<T>>(
            resolve => waiters.push(resolve)
          );
          if (result.done) return;
          yield result.value;
        }
      }
    }
  };
}

/**
 * Empty async iterable for default parameter values.
 */
export async function* emptyAsyncIterable<T>(): AsyncGenerator<T> {
  // Yields nothing, immediately returns
}
