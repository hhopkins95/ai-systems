/**
 * Host Implementations
 *
 * Session host implementations for different deployment scenarios.
 */

// Local host (in-memory + Socket.IO)
export {
  LocalSessionHost,
  type TransportOptions,
} from './local/index.js';
