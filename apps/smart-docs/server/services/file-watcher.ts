import * as chokidar from 'chokidar';
import * as path from 'path';
import { EventEmitter } from 'events';
import type { ServerConfig, FileChangeEvent, FileEventType } from '@/types';

export class FileSystemWatcher extends EventEmitter {
  private watchers: Map<string, chokidar.FSWatcher> = new Map();
  private config: ServerConfig;

  constructor(config: ServerConfig) {
    super();
    this.config = config;
  }

  start() {
    // Watch docs folder
    this.watchPath(
      'docs',
      this.config.docsPath,
      ['**/*.md'],
      'docs'
    );

    // Watch global Claude config
    const globalClaudePath = path.join(this.config.homeDir, '.claude');
    this.watchPath(
      'global-claude',
      globalClaudePath,
      ['skills/**', 'commands/**', 'agents/**', 'hooks/**', 'plugins/**/**/plugin.json', 'CLAUDE.md'],
      'claude'
    );

    // Watch project Claude config
    const projectClaudePath = path.join(this.config.projectRoot, '.claude');
    this.watchPath(
      'project-claude',
      projectClaudePath,
      ['**/*'],
      'claude'
    );

    // Watch for CLAUDE.md files throughout project (at directory roots)
    this.watchPath(
      'project-claude-md',
      this.config.projectRoot,
      ['**/CLAUDE.md'],
      'claude'
    );

    console.log('👀 File watching started');
  }

  private watchPath(
    id: string,
    basePath: string,
    patterns: string[],
    area: 'docs' | 'claude' | 'plugins'
  ) {
    const watcher = chokidar.watch(patterns, {
      cwd: basePath,
      ignoreInitial: true,
      ignored: ['**/node_modules/**', '**/.git/**', '**/.next/**', '**/dist/**', '**/build/**', '**/coverage/**'],
    });

    watcher.on('all', (event: string, relativePath: string) => {
      const fileEvent: FileChangeEvent = {
        area,
        type: this.mapEventType(event),
        path: path.join(basePath, relativePath),
      };

      this.emit('change', fileEvent);
    });

    this.watchers.set(id, watcher);
  }

  private mapEventType(event: string): FileEventType {
    switch (event) {
      case 'add':
      case 'addDir':
        return 'add';
      case 'change':
        return 'change';
      case 'unlink':
      case 'unlinkDir':
        return 'unlink';
      default:
        return 'change';
    }
  }

  stop() {
    this.watchers.forEach(watcher => watcher.close());
    this.watchers.clear();
    console.log('👋 File watching stopped');
  }
}
