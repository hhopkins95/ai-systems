import { createServer } from "http";
import { createAgentRuntime, createLocalHost, type PersistenceAdapter } from "@hhopkins/agent-server";
import dotenv from "dotenv";
import { InMemoryPersistenceAdapter, SqlitePersistenceAdapter } from "./persistence/index.js";
import { config, validateConfig, createExampleAgentProfile } from "./config.js";
import path from "path";
import { fileURLToPath } from "url";

// Load environment variables
dotenv.config();


const dirname = path.dirname(fileURLToPath(import.meta.url));
const agentSessionsDirectoryPath = path.join(dirname, "../../../.agent-sessions");

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

    // Create local host (in-memory sessions + Socket.IO transport)
    const host = createLocalHost({
      persistence,
      executionEnvironment: {
        type: "local",
        local: {
          sessionsDirectoryPath: agentSessionsDirectoryPath,
          shouldCleanup: true,
        }
      },
    });
    console.log("✅ Local host created");

    // Create agent runtime with the host
    const runtime = await createAgentRuntime({
      sessionHost: host.sessionHost,
    });

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

    // Attach WebSocket transport to HTTP server
    const io = host.attachTransport(httpServer);
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
      console.log(`  GET    /persistence/:id (raw SQLite data)\n`);
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
