// Michael and Associates fork: Claude Brain's HTTP service. Metabase calls it over Railway's private network with a
// shared secret: once per chat turn (POST /turn, which streams the turn back as one JSON part per line, in the shape
// Metabase's chat stream takes) and once per new conversation for its title (POST /title).
import { timingSafeEqual } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";

import { generateTitle } from "./title.ts";
import { runTurn, type TurnRequest } from "./turn.ts";

const PORT = Number(process.env.PORT ?? 8080);
const SECRET = requiredEnv("CLAUDE_BRAIN_SECRET");
requiredEnv("ANTHROPIC_API_KEY");

// A turn's request carries Metabase's chat context, which includes the queries on screen.
const MAX_BODY_BYTES = 5 * 1024 * 1024;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  return value;
}

function isAuthorized(req: IncomingMessage): boolean {
  const expected = Buffer.from(`Bearer ${SECRET}`);
  const given = Buffer.from(req.headers.authorization ?? "");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) {
      throw new Error("Request body is too large");
    }
    chunks.push(chunk as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function handleTurn(req: IncomingMessage, res: ServerResponse) {
  const request = (await readJson(req)) as TurnRequest;
  const abort = new AbortController();
  // Metabase closes the connection when the person stops the reply or leaves; the agent stops with it.
  res.on("close", () => {
    if (!res.writableEnded) {
      abort.abort();
    }
  });
  res.writeHead(200, {
    "Content-Type": "application/x-ndjson",
    "Cache-Control": "no-store",
  });
  try {
    for await (const part of runTurn(request, abort)) {
      res.write(`${JSON.stringify(part)}\n`);
    }
  } catch (error) {
    if (!abort.signal.aborted) {
      console.error("Turn failed", {
        conversationId: request.conversationId,
        error,
      });
      res.write(
        `${JSON.stringify({ type: "error", error: { message: errorMessage(error) } })}\n`,
      );
    }
  }
  res.end();
}

async function handleTitle(req: IncomingMessage, res: ServerResponse) {
  const { message } = (await readJson(req)) as { message: string };
  sendJson(res, 200, { title: await generateTitle(message) });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/health") {
      sendJson(res, 200, { ok: true });
    } else if (!isAuthorized(req)) {
      sendJson(res, 401, { error: "unauthorized" });
    } else if (req.method === "POST" && req.url === "/turn") {
      await handleTurn(req, res);
    } else if (req.method === "POST" && req.url === "/title") {
      await handleTitle(req, res);
    } else {
      sendJson(res, 404, { error: "not found" });
    }
  } catch (error) {
    console.error("Request failed", { url: req.url, error });
    if (!res.headersSent) {
      sendJson(res, 500, { error: errorMessage(error) });
    } else {
      res.end();
    }
  }
});

// "::" listens on IPv6 and IPv4, so Railway's private network reaches the service whichever it uses.
server.listen(PORT, "::", () => {
  console.log(`Claude Brain listening on port ${PORT}`);
});
