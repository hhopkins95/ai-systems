import { resolve, isAbsolute } from "path";
import type { ClaudePluginInstallSource } from "@ai-systems/shared-types";

/**
 * Parser for plugin installation source strings
 *
 * Supported formats:
 * - "owner/repo" -> GitHub
 * - "https://github.com/owner/repo" -> GitHub
 * - "https://github.com/owner/repo.git" -> GitHub
 * - "git@github.com:owner/repo.git" -> GitHub (SSH)
 * - "https://gitlab.com/..." or any git URL -> Git URL
 * - "./local/path" or "/absolute/path" -> Directory
 * - "plugin-name@marketplace-name" -> Marketplace
 */
export class SourceParser {
  /**
   * Parse an install source string into structured ClaudePluginInstallSource
   */
  parse(source: string): ClaudePluginInstallSource {
    source = source.trim();

    // Check for marketplace format: plugin@marketplace
    // Must not start with git@ and must not contain /
    if (
      source.includes("@") &&
      !source.includes("/") &&
      !source.startsWith("git@")
    ) {
      const [pluginName, marketplaceName] = source.split("@");
      return { type: "marketplace", pluginName, marketplaceName };
    }

    // Check for local path
    if (
      source.startsWith("./") ||
      source.startsWith("../") ||
      source.startsWith("~/") ||
      isAbsolute(source)
    ) {
      let path = source;
      if (source.startsWith("~/")) {
        const home = process.env.HOME || process.env.USERPROFILE || "";
        path = resolve(home, source.slice(2));
      } else {
        path = resolve(source);
      }
      return { type: "local", path };
    }

    // Check for GitHub short format: owner/repo
    if (/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+$/.test(source)) {
      const [owner, repo] = source.split("/");
      return { type: "github", owner, repo };
    }

    // Check for GitHub URL (HTTPS)
    const githubHttpsMatch = source.match(
      /^(?:https?:\/\/)?(?:www\.)?github\.com\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_.-]+?)(?:\.git)?$/
    );
    if (githubHttpsMatch) {
      return {
        type: "github",
        owner: githubHttpsMatch[1],
        repo: githubHttpsMatch[2],
      };
    }

    // Check for git SSH URL (git@...)
    const sshMatch = source.match(
      /^git@([^:]+):([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_.-]+?)(?:\.git)?$/
    );
    if (sshMatch) {
      if (sshMatch[1] === "github.com") {
        return { type: "github", owner: sshMatch[2], repo: sshMatch[3] };
      }
      return { type: "url", url: source };
    }

    // Assume it's a git URL
    return { type: "url", url: source };
  }

  /**
   * Convert an install source to a git URL (if applicable)
   */
  toGitUrl(source: ClaudePluginInstallSource): string | null {
    switch (source.type) {
      case "github":
        return `https://github.com/${source.owner}/${source.repo}.git`;
      case "url":
        return source.url;
      case "local":
      case "marketplace":
        return null;
    }
  }

  /**
   * Get a human-readable description of a source
   */
  describe(source: ClaudePluginInstallSource): string {
    switch (source.type) {
      case "github":
        return `GitHub: ${source.owner}/${source.repo}`;
      case "url":
        return `Git: ${source.url}`;
      case "local":
        return `Local: ${source.path}`;
      case "marketplace":
        return `Marketplace: ${source.pluginName}@${source.marketplaceName}`;
    }
  }
}
