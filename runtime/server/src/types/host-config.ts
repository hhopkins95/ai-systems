/**
 * Host Configuration Types
 *
 * Defines configuration for different session hosting strategies.
 * The host determines WHERE sessions live and how they're located.
 */

// ============================================================================
// Local Host Configuration
// ============================================================================

/**
 * Configuration for local (in-memory) session hosting with Socket.IO transport.
 *
 * This is the default host for single-server deployments.
 */
export interface LocalHostConfig {
  type: 'local';

  /**
   * CORS configuration for Socket.IO
   */
  cors?: {
    origin: string | string[];
    credentials?: boolean;
  };

  /**
   * Socket.IO path
   * @default '/socket.io'
   */
  socketPath?: string;
}

// ============================================================================
// Future Host Configurations (Placeholders)
// ============================================================================

/**
 * Configuration for Cloudflare Durable Object session hosting.
 *
 * Each session lives in its own Durable Object with native WebSocket support.
 * Not yet implemented.
 */
export interface DurableObjectHostConfig {
  type: 'durable-object';

  /**
   * Cloudflare environment bindings
   */
  env: unknown;
}

/**
 * Configuration for Redis-coordinated clustered session hosting.
 *
 * Sessions are distributed across nodes with Redis for coordination.
 * Not yet implemented.
 */
export interface ClusteredHostConfig {
  type: 'clustered';

  /**
   * Redis connection configuration
   */
  redis: {
    url: string;
  };
}

// ============================================================================
// Host Config Union
// ============================================================================

/**
 * Union of all possible host configurations.
 *
 * Use `host.type` to discriminate between configurations.
 */
export type HostConfig =
  | LocalHostConfig
  | DurableObjectHostConfig
  | ClusteredHostConfig;
