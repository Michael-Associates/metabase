// Michael and Associates fork: one chat turn. Runs Claude's own agent loop (the Claude Agent SDK, which is Claude
// Code's loop as a library) with the signed-in person's Metabase tools, and translates what the loop streams into
// the parts Metabase's chat stream takes (`metabase.metabot.self.core/parts->aisdk-sse-xf` lists them).
import { query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";

import { SYSTEM_PROMPT, turnPrompt, type HistoryEntry } from "./prompt.ts";
import {
  forgetSession,
  rememberSession,
  sessionFor,
  WORK_DIR,
  CONFIG_DIR,
} from "./sessions.ts";
import { toolName, toolTitle } from "./tools.ts";

export interface TurnRequest {
  conversationId: string;
  message: string;
  // Metabase's chat context: what the person is looking at, their local time, what they may do.
  context: unknown;
  // The conversation so far, as plain text, for a conversation whose agent session is gone.
  history: HistoryEntry[];
  user: { id: number; name: string };
  // Metabase's MCP endpoint and an access token for the signed-in person, good for this turn only.
  mcp: { url: string; token: string };
}

export type Part =
  | { type: "start" }
  | { type: "text"; id: string; text: string }
  | { type: "reasoning"; id: string; text: string }
  | { type: "tool-input-start"; id: string; function: string }
  | {
      type: "tool-input";
      id: string;
      function: string;
      arguments: unknown;
      title: string;
    }
  | { type: "tool-output"; id: string; result: { output: string } }
  | { type: "tool-output"; id: string; error: { message: string } }
  | {
      type: "usage";
      model: string;
      usage: {
        promptTokens: number;
        completionTokens: number;
        cacheCreationTokens: number;
        cacheReadTokens: number;
      };
      "finish-reason"?: string;
    }
  | { type: "finish"; "finish-reason": "max-iterations" }
  | { type: "error"; error: { message: string } };

const MODEL = process.env.CLAUDE_BRAIN_MODEL ?? "claude-opus-5-5";
const MCP_SERVER = "metabase";
// Long jobs (a dashboard of many cards) take many steps; this stops a loop that never ends.
const MAX_TURNS = 80;
// What a tool returned is kept with the conversation; the panel only needs its gist.
const MAX_TOOL_OUTPUT_CHARS = 2000;

export async function* runTurn(
  request: TurnRequest,
  abort: AbortController,
): AsyncGenerator<Part> {
  const sessionId = sessionFor(request.conversationId);
  let yielded = false;
  try {
    for await (const part of runQuery(request, abort, sessionId)) {
      yielded = true;
      yield part;
    }
  } catch (error) {
    // A session that can't be resumed (its file is gone) fails before anything streams: start a new one, which
    // gets the conversation so far as text.
    if (sessionId && !yielded && !abort.signal.aborted) {
      console.warn("Could not resume the session, starting a new one", {
        conversationId: request.conversationId,
        error: error instanceof Error ? error.message : String(error),
      });
      forgetSession(request.conversationId);
      yield* runQuery(request, abort, undefined);
    } else {
      throw error;
    }
  }
}

async function* runQuery(
  request: TurnRequest,
  abort: AbortController,
  resume: string | undefined,
): AsyncGenerator<Part> {
  const messages = query({
    prompt: turnPrompt(request, { withHistory: !resume }),
    options: {
      model: MODEL,
      systemPrompt: SYSTEM_PROMPT,
      // No built-in tools (no shell, no files, no web): only the person's Metabase tools.
      tools: [],
      mcpServers: {
        [MCP_SERVER]: {
          type: "http",
          url: request.mcp.url,
          headers: { Authorization: `Bearer ${request.mcp.token}` },
        },
      },
      allowedTools: [`mcp__${MCP_SERVER}__*`],
      // Anything not allowed above is refused, never asked about: nobody is there to answer.
      permissionMode: "dontAsk",
      settingSources: [],
      includePartialMessages: true,
      resume,
      cwd: WORK_DIR,
      maxTurns: MAX_TURNS,
      abortController: abort,
      env: {
        ...process.env,
        CLAUDE_CONFIG_DIR: CONFIG_DIR,
        CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1",
      },
    },
  });

  const translator = new Translator(request.conversationId);
  try {
    for await (const message of messages) {
      yield* translator.translate(message);
    }
  } catch (error) {
    // After an error result the SDK throws too; the result already became an error part.
    if (!translator.finished) {
      throw error;
    }
  }
}

class Translator {
  finished = false;
  private readonly conversationId: string;
  private messageId = "";
  private blockIds = new Map<number, string>();

  constructor(conversationId: string) {
    this.conversationId = conversationId;
  }

  *translate(message: SDKMessage): Generator<Part> {
    switch (message.type) {
      case "system":
        if (message.subtype === "init") {
          rememberSession(this.conversationId, message.session_id);
          const metabase = message.mcp_servers.find(
            (server) => server.name === MCP_SERVER,
          );
          if (
            metabase &&
            (metabase.status === "failed" || metabase.status === "needs-auth")
          ) {
            throw new Error(
              `Claude Brain could not reach Metabase's tools (${metabase.status}).`,
            );
          }
        }
        return;
      case "stream_event":
        // Subagents' output isn't streamed; there are none here.
        if (message.parent_tool_use_id === null) {
          yield* this.streamEvent(message.event);
        }
        return;
      case "assistant":
        // Text already streamed as deltas; a finished tool call carries its complete input.
        if (message.parent_tool_use_id === null) {
          for (const block of message.message.content) {
            if (block.type === "tool_use") {
              yield {
                type: "tool-input",
                id: block.id,
                function: toolName(block.name),
                arguments: block.input,
                title: toolTitle(block.name),
              };
            }
          }
        }
        return;
      case "user":
        if (
          message.parent_tool_use_id === null &&
          Array.isArray(message.message.content)
        ) {
          for (const block of message.message.content) {
            if (block.type === "tool_result") {
              const output = toolResultText(block.content).slice(
                0,
                MAX_TOOL_OUTPUT_CHARS,
              );
              yield block.is_error
                ? {
                    type: "tool-output",
                    id: block.tool_use_id,
                    error: { message: output || "The tool failed." },
                  }
                : {
                    type: "tool-output",
                    id: block.tool_use_id,
                    result: { output },
                  };
            }
          }
        }
        return;
      case "result":
        yield* this.result(message);
        return;
      default:
        return;
    }
  }

  private *streamEvent(
    event: Extract<SDKMessage, { type: "stream_event" }>["event"],
  ): Generator<Part> {
    switch (event.type) {
      case "message_start":
        this.messageId = event.message.id;
        this.blockIds.clear();
        yield { type: "start" };
        return;
      case "content_block_start": {
        const id = `${this.messageId}-${event.index}`;
        this.blockIds.set(event.index, id);
        if (event.content_block.type === "tool_use") {
          yield {
            type: "tool-input-start",
            id: event.content_block.id,
            function: toolName(event.content_block.name),
          };
        }
        return;
      }
      case "content_block_delta": {
        const id =
          this.blockIds.get(event.index) ?? `${this.messageId}-${event.index}`;
        if (event.delta.type === "text_delta") {
          yield { type: "text", id, text: event.delta.text };
        } else if (event.delta.type === "thinking_delta") {
          yield { type: "reasoning", id, text: event.delta.thinking };
        }
        return;
      }
      default:
        return;
    }
  }

  private *result(
    message: Extract<SDKMessage, { type: "result" }>,
  ): Generator<Part> {
    this.finished = true;
    console.log("Turn finished", {
      conversationId: this.conversationId,
      subtype: message.subtype,
      turns: message.num_turns,
      costUsd: message.total_cost_usd,
      durationMs: message.duration_ms,
    });
    for (const [model, usage] of Object.entries(message.modelUsage)) {
      yield {
        type: "usage",
        model: `anthropic/${model}`,
        usage: {
          promptTokens:
            usage.inputTokens +
            usage.cacheReadInputTokens +
            usage.cacheCreationInputTokens,
          completionTokens: usage.outputTokens,
          cacheCreationTokens: usage.cacheCreationInputTokens,
          cacheReadTokens: usage.cacheReadInputTokens,
        },
        ...(message.stop_reason === "max_tokens"
          ? { "finish-reason": "length" }
          : {}),
      };
    }
    if (message.subtype === "error_max_turns") {
      // The panel offers to continue.
      yield { type: "finish", "finish-reason": "max-iterations" };
    } else if (message.subtype !== "success") {
      const reason = message.errors.join(" ") || message.subtype;
      yield {
        type: "error",
        error: { message: `Claude Brain stopped: ${reason}` },
      };
    }
  }
}

function toolResultText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((block) =>
        block && typeof block === "object" && "text" in block
          ? String(block.text)
          : "",
      )
      .filter(Boolean)
      .join("\n");
  }
  return "";
}
