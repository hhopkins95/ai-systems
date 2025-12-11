/**
 * Bundle utilities for OpenCode Claude Adapter
 *
 * This module provides access to the bundled adapter content for use
 * in execution environments (Modal sandboxes, etc.) where workspace
 * dependencies are not available.
 */

import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Path to the bundled adapter.
 * Use this to copy the adapter into execution environments.
 */
export const adapterBundlePath = join(__dirname, 'adapter.bundle.js');

/**
 * Get the content of the bundled adapter.
 * Use this to write the adapter directly into execution environments.
 */
export const getAdapterBundleContent = (): string => {
  return readFileSync(adapterBundlePath, 'utf-8');
};
