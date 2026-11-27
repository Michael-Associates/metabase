// Michael and Associates fork: which agent session holds each Metabase conversation, so a follow-up question resumes
// the session with everything it already did (queries run, things built). Sessions and this map live on the
// service's volume, so they survive a redeploy.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DATA_DIR = process.env.CLAUDE_BRAIN_DATA_DIR ?? "/data";
// The agent's own files: session transcripts under projects/.
export const CONFIG_DIR = join(DATA_DIR, "claude");
// An empty working directory: the agent has no file tools, so nothing is ever written here.
export const WORK_DIR = join(DATA_DIR, "work");
const SESSIONS_FILE = join(DATA_DIR, "sessions.json");

mkdirSync(CONFIG_DIR, { recursive: true });
mkdirSync(WORK_DIR, { recursive: true });

const sessions: Record<string, string> = load();

function load(): Record<string, string> {
  try {
    return JSON.parse(readFileSync(SESSIONS_FILE, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error(
        "Could not read the sessions file; conversations start new sessions",
        { error },
      );
    }
    return {};
  }
}

function save() {
  const temporary = `${SESSIONS_FILE}.tmp`;
  writeFileSync(temporary, JSON.stringify(sessions));
  renameSync(temporary, SESSIONS_FILE);
}

export function sessionFor(conversationId: string): string | undefined {
  return sessions[conversationId];
}

export function rememberSession(conversationId: string, sessionId: string) {
  if (sessions[conversationId] !== sessionId) {
    sessions[conversationId] = sessionId;
    save();
  }
}

export function forgetSession(conversationId: string) {
  if (conversationId in sessions) {
    delete sessions[conversationId];
    save();
  }
}
