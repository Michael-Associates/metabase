// Michael and Associates fork: how Claude Brain's tool calls read in the chat panel's steps.
const METABASE_TOOL_PREFIX = /^mcp__metabase__/;

const TITLES: Record<string, string> = {
  search: "Searching Metabase",
  browse_collection: "Looking in a collection",
  browse_data: "Looking at the data",
  get_content: "Reading",
  get_parameter_values: "Reading filter values",
  glossary: "Reading the glossary",
  learn: "Reading a guide",
  execute_query: "Running a query",
  execute_sql: "Running SQL",
  run_saved_question: "Running a saved question",
  question_write: "Saving a question",
  metric_write: "Saving a metric",
  measure_write: "Saving a measure",
  segment_write: "Saving a segment",
  dashboard_write: "Working on a dashboard",
  document_write: "Writing a document",
  collection_write: "Working on a collection",
  duplicate_content: "Duplicating",
  bookmark_content: "Bookmarking",
  alert_write: "Setting up an alert",
  subscription_write: "Setting up a subscription",
};

// The name without the server prefix, as Metabase's own tools are named: `execute_query`.
export function toolName(name: string): string {
  return name.replace(METABASE_TOOL_PREFIX, "");
}

export function toolTitle(name: string): string {
  const short = toolName(name);
  return TITLES[short] ?? `Using ${short.replaceAll("_", " ")}`;
}
