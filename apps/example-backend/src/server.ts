import { createServer } from "http";
import { createAgentRuntime, type PersistenceAdapter } from "@hhopkins/agent-server";
import {
  createOpenCodeEventConverter,
  parseOpenCodeTranscriptFile,
} from "@hhopkins/agent-converters/opencode";
import { sdkMessageToEvents } from "@hhopkins/agent-converters/claude-sdk";
import {
  reduceSessionEvent,
  createInitialConversationState,
  type AnySessionEvent,
} from "@hhopkins/agent-converters";
import dotenv from "dotenv";
import fs from "fs/promises";
import { InMemoryPersistenceAdapter, SqlitePersistenceAdapter } from "./persistence/index.js";
import { config, validateConfig, createExampleAgentProfile } from "./config.js";
import path from "path";
import { fileURLToPath } from "url";

// Load environment variables
dotenv.config();


const dirname = path.dirname(fileURLToPath(import.meta.url));
const agentSessionsDirectoryPath = path.join(dirname, "../../../.agent-sessions");
const openCodeFixturesDir = path.join(dirname, "../../../packages/converters/src/opencode/test");
const claudeSdkFixturesDir = path.join(dirname, "../../../packages/converters/src/claude-sdk/test");

/**
 * Extract the main session ID from raw OpenCode events.
 * Looks for the first event that contains a session ID.
 */
function extractSessionIdFromEvents(events: unknown[]): string | undefined {
  for (const event of events) {
    const e = event as Record<string, unknown>;
    // Check message.updated events
    if (e.type === 'message.updated') {
      const info = (e.properties as Record<string, unknown>)?.info as Record<string, unknown>;
      if (info?.sessionID) return info.sessionID as string;
    }
    // Check session.updated events
    if (e.type === 'session.updated') {
      const info = (e.properties as Record<string, unknown>)?.info as Record<string, unknown>;
      if (info?.id) return info.id as string;
    }
  }
  return undefined;
}

/**
 * Main server entry point
 *
 * This example demonstrates:
 * 1. Setting up a local host with in-memory persistence
 * 2. Configuring an agent profile (Claude SDK)
 * 3. Starting HTTP REST server and WebSocket server
 * 4. Graceful shutdown handling
 */
async function main() {
  try {
    console.log("🚀 Starting Agent Runtime Example Server...\n");

    // Validate environment variables
    validateConfig();

    // Create agent profile (bundles MCP directories)
    const exampleAgentProfile = await createExampleAgentProfile();
    console.log("✅ Agent profile created");

    // Create persistence adapter based on configuration
    let persistence: PersistenceAdapter;
    if (config.persistence.type === "sqlite") {
      persistence = new SqlitePersistenceAdapter(
        config.persistence.sqliteDbPath,
        [exampleAgentProfile]
      );
      console.log(`✅ SQLite persistence adapter initialized (${config.persistence.sqliteDbPath})`);
    } else {
      persistence = new InMemoryPersistenceAdapter([exampleAgentProfile]);
      console.log("✅ In-memory persistence adapter initialized");
    }

    // Create agent runtime with full configuration
    const runtime = await createAgentRuntime({
      persistence,
      executionEnvironment: {
        type: "local",
        local: {
          sessionsDirectoryPath: agentSessionsDirectoryPath,
          shouldCleanup: true,
        }
      },
      host: { type: "local" },
    });
    console.log("✅ Agent runtime created (local host)");

    // Start runtime
    await runtime.start();
    console.log("✅ Agent runtime started");

    // Create REST API server (Hono)
    const restApp = runtime.createRestServer({
      apiKey: "example-api-key", // In production, use a real API key
    });
    console.log("✅ REST API server created");

    // Create HTTP server
    const httpServer = createServer(async (req, res) => {
      // Debug endpoint - returns raw server state
      if (req.url === '/debug' && req.method === 'GET') {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');

        const loadedSessionIds = runtime.sessionHost.getLoadedSessionIds();
        const debugData = {
          timestamp: Date.now(),
          loadedSessionCount: loadedSessionIds.length,
          sessions: loadedSessionIds.map((sessionId) => {
            const session = runtime.sessionHost.getSession(sessionId);
            return {
              sessionId,
              state: session?.getState(),
            };
          }),
        };

        res.statusCode = 200;
        res.end(JSON.stringify(debugData, null, 2));
        return;
      }

      // Delete session endpoint - permanently deletes session from persistence
      // This is an app-level operation handled by the example backend, not the runtime
      const deleteMatch = req.url?.match(/^\/sessions\/([^/]+)$/);
      if (deleteMatch && req.method === 'DELETE') {
        const sessionId = deleteMatch[1];

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');

        try {
          // First unload from runtime (if loaded)
          const session = runtime.sessionHost.getSession(sessionId);
          if (session) {
            await runtime.sessionHost.unloadSession(sessionId);
          }

          // Delete from SQLite directly (app-level operation)
          if (persistence instanceof SqlitePersistenceAdapter) {
            persistence.deleteSession(sessionId);
          }

          res.statusCode = 200;
          res.end(JSON.stringify({ success: true, sessionId }));
        } catch (error) {
          console.error('Failed to delete session:', error);
          res.statusCode = 500;
          res.end(JSON.stringify({ error: 'Failed to delete session' }));
        }
        return;
      }

      // Persistence debug endpoint - returns raw data from SQLite tables
      const persistenceMatch = req.url?.match(/^\/persistence\/([^/]+)$/);
      if (persistenceMatch && req.method === 'GET') {
        const sessionId = persistenceMatch[1];

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');

        if (!(persistence instanceof SqlitePersistenceAdapter)) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'Persistence debug only available with SQLite adapter' }));
          return;
        }

        try {
          const rawData = persistence.getRawSessionData(sessionId);
          res.statusCode = 200;
          res.end(JSON.stringify({
            sessionId,
            tables: rawData,
          }, null, 2));
        } catch (error) {
          console.error('Failed to get raw persistence data:', error);
          res.statusCode = 500;
          res.end(JSON.stringify({ error: 'Failed to get raw persistence data' }));
        }
        return;
      }

      // =======================================================================
      // Converter Debug Endpoints
      // =======================================================================

      // GET /debug/fixtures - List available fixture files from both converters
      if (req.url === '/debug/fixtures' && req.method === 'GET') {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');

        try {
          // Load OpenCode fixtures
          const openCodeFiles = await fs.readdir(openCodeFixturesDir);
          const openCodeFixtures = await Promise.all(
            openCodeFiles
              .filter(f => f.endsWith('.json') || f.endsWith('.jsonl'))
              .map(async (name) => {
                const stat = await fs.stat(path.join(openCodeFixturesDir, name));
                return {
                  name,
                  size: stat.size,
                  fileType: name.endsWith('.jsonl') ? 'jsonl' as const : 'json' as const,
                  converter: 'opencode' as const,
                };
              })
          );

          // Load Claude SDK fixtures
          const claudeFiles = await fs.readdir(claudeSdkFixturesDir);
          const claudeFixtures = await Promise.all(
            claudeFiles
              .filter(f => f.endsWith('.json') || f.endsWith('.jsonl'))
              .map(async (name) => {
                const stat = await fs.stat(path.join(claudeSdkFixturesDir, name));
                return {
                  name,
                  size: stat.size,
                  fileType: name.endsWith('.jsonl') ? 'jsonl' as const : 'json' as const,
                  converter: 'claude-sdk' as const,
                };
              })
          );

          res.statusCode = 200;
          res.end(JSON.stringify({
            fixtures: [...openCodeFixtures, ...claudeFixtures],
          }));
        } catch (error) {
          console.error('Failed to list fixtures:', error);
          res.statusCode = 500;
          res.end(JSON.stringify({ error: 'Failed to list fixtures' }));
        }
        return;
      }

      // GET /debug/fixtures/:converter/:filename - Get raw fixture content
      const fixtureMatch = req.url?.match(/^\/debug\/fixtures\/(opencode|claude-sdk)\/(.+)$/);
      if (fixtureMatch && req.method === 'GET') {
        const converter = fixtureMatch[1] as 'opencode' | 'claude-sdk';
        const filename = decodeURIComponent(fixtureMatch[2]);
        res.setHeader('Access-Control-Allow-Origin', '*');

        // Security: prevent path traversal
        if (filename.includes('..') || filename.includes('/')) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'Invalid filename' }));
          return;
        }

        const fixturesDir = converter === 'opencode' ? openCodeFixturesDir : claudeSdkFixturesDir;

        try {
          const filePath = path.join(fixturesDir, filename);
          const content = await fs.readFile(filePath, 'utf-8');
          res.setHeader('Content-Type', filename.endsWith('.jsonl') ? 'text/plain' : 'application/json');
          res.statusCode = 200;
          res.end(content);
        } catch (error) {
          console.error('Failed to read fixture:', error);
          res.statusCode = 404;
          res.end(JSON.stringify({ error: 'Fixture not found' }));
        }
        return;
      }

      // POST /debug/convert - Run conversion on fixture data
      // Supports both OpenCode and Claude SDK converters
      if (req.url === '/debug/convert' && req.method === 'POST') {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');

        try {
          const body = await getRequestBody(req);
          const { mode, content, mainSessionId, converter: converterType = 'opencode' } = JSON.parse(body);

          if (mode === 'streaming') {
            // Streaming mode: convert raw events one at a time
            const rawEvents: unknown[] = typeof content === 'string'
              ? content.trim().split('\n').map((line: string) => JSON.parse(line))
              : content;

            let state = createInitialConversationState();
            const sessionEventsByStep: AnySessionEvent[][] = [];
            const allSessionEvents: AnySessionEvent[] = [];

            if (converterType === 'opencode') {
              // OpenCode: stateful converter - detect session ID from events if not provided
              const detectedSessionId = mainSessionId || extractSessionIdFromEvents(rawEvents) || 'main-session';
              const openCodeConverter = createOpenCodeEventConverter(detectedSessionId);

              for (const event of rawEvents) {
                // @ts-ignore
                const converted = openCodeConverter.parseEvent(event);
                sessionEventsByStep.push(converted);
                for (const sessionEvent of converted) {
                  allSessionEvents.push(sessionEvent);
                  state = reduceSessionEvent(state, sessionEvent);
                }
              }
            } else if (converterType === 'claude-sdk') {
              // Claude SDK: stateless converter (each message converts independently)
              for (const event of rawEvents) {
                const converted = sdkMessageToEvents(event as any);
                sessionEventsByStep.push(converted);
                for (const sessionEvent of converted) {
                  allSessionEvents.push(sessionEvent);
                  state = reduceSessionEvent(state, sessionEvent);
                }
              }
            } else {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: 'Invalid converter. Use "opencode" or "claude-sdk"' }));
              return;
            }

            res.statusCode = 200;
            res.end(JSON.stringify({
              rawEvents,
              sessionEventsByStep,
              sessionEvents: allSessionEvents,
              finalState: state,
              stats: {
                rawEventCount: rawEvents.length,
                sessionEventCount: allSessionEvents.length,
                blockCount: state.blocks.length,
                subagentCount: state.subagents.length,
              },
            }));
          } else if (mode === 'transcript') {
            // Transcript mode: parse complete transcript
            const transcriptContent = typeof content === 'string' ? content : JSON.stringify(content);
            const state = parseOpenCodeTranscriptFile(transcriptContent);

            res.statusCode = 200;
            res.end(JSON.stringify({
              finalState: state,
              stats: {
                blockCount: state.blocks.length,
                subagentCount: state.subagents.length,
              },
            }));
          } else {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'Invalid mode. Use "streaming" or "transcript"' }));
          }
        } catch (error) {
          console.error('Conversion failed:', error);
          res.statusCode = 500;
          res.end(JSON.stringify({ error: 'Conversion failed', details: String(error) }));
        }
        return;
      }

      // Handle CORS preflight for debug endpoints
      if (req.url?.startsWith('/debug/') && req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        res.statusCode = 204;
        res.end();
        return;
      }

      // Use Hono's fetch handler
      const response = await restApp.fetch(
        new Request(`http://${req.headers.host}${req.url}`, {
          method: req.method,
          headers: req.headers as any,
          body: req.method !== "GET" && req.method !== "HEAD"
            ? await getRequestBody(req)
            : undefined,
        })
      );

      // Convert Response to Node.js response
      res.statusCode = response.status;
      response.headers.forEach((value, key) => {
        res.setHeader(key, value);
      });

      const body = await response.text();
      res.end(body);
    });

    // Attach WebSocket transport to HTTP server (local host only)
    if (!runtime.attachTransport) {
      throw new Error("attachTransport not available - only supported for local host");
    }
    const io = runtime.attachTransport(httpServer);
    console.log("✅ WebSocket transport attached");

    // Start HTTP server
    httpServer.listen(config.port, () => {
      console.log("\n" + "=".repeat(50));
      console.log("🎉 Server is running!");
      console.log("=".repeat(50));
      console.log(`📍 HTTP:      http://localhost:${config.port}`);
      console.log(`📍 WebSocket: ws://localhost:${config.port}`);
      console.log(`🤖 Agent:     ${exampleAgentProfile.name}`);
      console.log("=".repeat(50) + "\n");
      console.log("Available endpoints:");
      console.log(`  POST   /sessions/create`);
      console.log(`  GET    /sessions/:id`);
      console.log(`  POST   /sessions/:id/message`);
      console.log(`  DELETE /sessions/:id (permanent deletion)`);
      console.log(`  GET    /sessions`);
      console.log(`  GET    /agent-profiles`);
      console.log(`  GET    /health`);
      console.log(`  GET    /debug (raw server state)`);
      console.log(`  GET    /persistence/:id (raw SQLite data)`);
      console.log(`  GET    /debug/fixtures (list test fixtures)`);
      console.log(`  GET    /debug/fixtures/:name (get fixture content)`);
      console.log(`  POST   /debug/convert (run converter)\n`);
    });

    // Graceful shutdown
    const shutdown = async () => {
      console.log("\n🛑 Shutting down gracefully...");

      // Close HTTP server
      httpServer.close();

      // Close WebSocket server
      io.close();

      // Shutdown runtime (sync sessions, terminate sandboxes)
      await runtime.shutdown();

      console.log("✅ Shutdown complete");
      process.exit(0);
    };

    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);

  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
}

/**
 * Helper to get request body from Node.js request
 */
function getRequestBody(req: any): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk: any) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      resolve(body);
    });
    req.on("error", reject);
  });
}

// Start the server
main();
