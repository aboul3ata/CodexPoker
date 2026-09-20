type Tool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: { readOnlyHint: boolean };
  execute: (input: Record<string, unknown>) => Promise<unknown>;
};
type ModelContext = {
  registerTool(tool: Tool): Promise<void> | void;
  unregisterTool?(name: string): void;
};

const context =
  (document as Document & { modelContext?: ModelContext }).modelContext ??
  (navigator as Navigator & { modelContext?: ModelContext }).modelContext;
const object = (properties = {}, required: string[] = []) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});

async function api(path: string, body?: unknown) {
  const response = await fetch(
    path,
    body === undefined
      ? undefined
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const data = await response.json();
  if (!response.ok) return { error: data.code, message: data.message };
  return data;
}

export async function registerPokerTools() {
  if (!context?.registerTool) return false;
  const tools: Tool[] = [
    {
      name: "get_hand_history",
      description:
        "Read completed hands for requested reviews or callbacks. Only public action history and legitimate showdown cards are returned. Do not coach mid-hand unless asked.",
      inputSchema: object(),
      annotations: { readOnlyHint: true },
      execute: () => api("/api/agent/history"),
    },
    {
      name: "get_table",
      description:
        "Read the live play-money poker table from Codex’s perspective. No opponent private cards. Ali acts in the browser. Codex is seat uplift. Use get_my_turn then act when it is your turn; converse in Codex chat.",
      inputSchema: object(),
      annotations: { readOnlyHint: true },
      execute: () => api("/api/agent/table"),
    },
    {
      name: "get_my_turn",
      description:
        "Get your own Codex hole cards and legal actions for your current turn. Decide your own move. Never disclose these cards or your private reasoning in chat before a legitimate showdown. Never inspect the human browser cards to choose a move.",
      inputSchema: object(),
      annotations: { readOnlyHint: true },
      execute: () => api("/api/agent/turn"),
    },
    {
      name: "act",
      description:
        "Play only Codex’s chosen move in this local play-money game. Supply the current turnToken and a unique requestId. Reuse requestId for retries. Raise amount is total street bet (raise TO); bet amount is chips. An all-in uses the legal maximum or call. Returns public-safe updated table, never Ali’s cards. Continue if Codex acts again; stop at Ali’s decision.",
      inputSchema: object(
        {
          turnToken: { type: "string" },
          requestId: { type: "string" },
          action: {
            type: "string",
            enum: ["fold", "check", "call", "bet", "raise"],
          },
          amount: { type: "integer", minimum: 1 },
        },
        ["turnToken", "requestId", "action"],
      ),
      annotations: { readOnlyHint: false },
      execute: (input) => api("/api/agent/action", input),
    },
    {
      name: "next_hand",
      description:
        "Deal the next play-money hand after the current hand ends, when the user asks to continue. Cannot interrupt a live hand. Pass the completed handId; retrying cannot deal twice.",
      inputSchema: object({ handId: { type: "string" } }, ["handId"]),
      annotations: { readOnlyHint: false },
      execute: (input) => api("/api/agent/next", input),
    },
    {
      name: "wait_for_event",
      description:
        "Wait up to 20 seconds for a public poker state change after cursor from get_table. Returns immediately if state already changed. Used during an active play session to notice Ali’s browser action. Does not wake an idle chat. On timeout let the user say turn to resume; do not busy-poll.",
      inputSchema: object({ cursor: { type: "string" } }, ["cursor"]),
      annotations: { readOnlyHint: true },
      execute: (input) =>
        api(
          `/api/agent/wait?cursor=${encodeURIComponent(String(input.cursor))}`,
        ),
    },
  ];
  for (const tool of tools) context.unregisterTool?.(tool.name);
  await Promise.all(tools.map((tool) => context.registerTool(tool)));
  return true;
}
