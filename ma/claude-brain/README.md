# Claude Brain

The service behind the chat panel of our Metabase fork. It runs Claude's own
agent loop (the [Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview),
Claude Code's loop as a library) in place of Metabot's, with Metabase's MCP
tools as the signed-in person. `src/metabase/metabot/claude_brain.clj` is the
Metabase side.

- `POST /turn`: one chat turn. Metabase sends the message, the chat context,
  the conversation so far and an MCP access token for the person; the
  response streams one JSON part per line.
- `POST /title`: a new conversation's title, from its first message.
- `GET /health`.

Both POSTs need `Authorization: Bearer <CLAUDE_BRAIN_SECRET>`.

## Configuration

- `ANTHROPIC_API_KEY`: the Claude API key.
- `CLAUDE_BRAIN_SECRET`: shared with Metabase (`MB_MA_CLAUDE_BRAIN_SECRET`).
- `CLAUDE_BRAIN_MODEL` (default `claude-opus-5-5`) and
  `CLAUDE_BRAIN_TITLE_MODEL` (default `claude-haiku-4-5-20251001`).
- `CLAUDE_BRAIN_DATA_DIR` (default `/data`): a volume. Agent sessions and the
  conversation-to-session map live there, so conversations survive a redeploy.
- `PORT` (default 8080).

Railway builds the `Dockerfile` here from `ma-main`. Node 22.18 or later runs
the TypeScript sources directly; `npm run check` type-checks them.
