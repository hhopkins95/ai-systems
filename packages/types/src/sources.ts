/**
 * Entity source types - where entities originate from
 * Note: "global" is used for backward compatibility (same as "user-global")
 */
export type EntitySourceType = "plugin" | "project" | "global";

/**
 * Tracks where an entity came from
 */
export interface EntitySource {
  /** The type of source */
  type?: EntitySourceType;
  /** Plugin ID if type is "plugin" (e.g., "frontend-design@claude-code-plugins") */
  pluginId?: string;
  /** Marketplace name if from a plugin in a marketplace */
  marketplace?: string;
  /** Absolute path to the entity file */
  path?: string;
}
