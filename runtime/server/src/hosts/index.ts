/**
 * Host Factories
 *
 * Pre-configured session hosts for different deployment scenarios.
 * Each host bundles a SessionHost implementation with its appropriate transport.
 */

// Local host (in-memory + Socket.IO)
export {
  createLocalHost,
  LocalSessionHost,
  type LocalHost,
  type LocalHostConfig,
  type TransportOptions,
} from './local/index.js';
