import * as path from 'path';
import type { ServerConfig } from '@/types';
import { ClaudeEntityManager } from '@hhopkins/claude-entity-manager';
import { FileSystemWatcher } from './file-watcher';
import { MarkdownService } from './markdown-service';

// Singleton instances
let entityManager: ClaudeEntityManager | null = null;
let watcher: FileSystemWatcher | null = null;
let markdownService: MarkdownService | null = null;

let initialized = false;

export function initializeServices(config: ServerConfig) {
  if (initialized) {
    return;
  }

  // Initialize ClaudeEntityManager with global claude dir and project dir
  entityManager = new ClaudeEntityManager({
    claudeDir: path.join(config.homeDir, '.claude'),
    projectDir: config.projectRoot,
    includeDisabled: true, // We handle filtering in routes as needed
  });

  watcher = new FileSystemWatcher(config);
  markdownService = new MarkdownService();

  // Start file watching
  watcher.start();

  initialized = true;
  console.log('✅ Services initialized');
}

export function getServices() {
  if (!initialized) {
    // Auto-initialize on first call
    try {
      const { getServerConfig } = require('../config');
      const config = getServerConfig();
      initializeServices(config);
    } catch (error) {
      throw new Error('Services not initialized and failed to auto-initialize: ' + error);
    }
  }

  return {
    entityManager: entityManager!,
    watcher: watcher!,
    markdownService: markdownService!,
  };
}

export function shutdownServices() {
  if (watcher) {
    watcher.stop();
  }
  initialized = false;
  console.log('👋 Services shutdown');
}
