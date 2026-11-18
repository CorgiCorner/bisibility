import type {
  AssistantErrorView,
  AssistantStreamEvent,
  ConversationView,
  MessageView,
  RunView,
} from "@/lib/assistant/wire";

export type ConversationState = {
  conversation: ConversationView | null;
  error: AssistantErrorView | null;
  /** The frozen starting snapshot and events allow deterministic handling of out-of-order delivery. */
  base: ConversationView | null;
  events: AssistantStreamEvent[];
};

export function conversationState(conversation: ConversationView | null = null): ConversationState {
  return { conversation, base: conversation, error: null, events: [] };
}

function replaceRun(runs: RunView[], run: RunView): RunView[] {
  return [...runs.filter((item) => item.id !== run.id), run];
}

function apply(state: ConversationState, event: AssistantStreamEvent): ConversationState {
  let conversation = state.conversation;
  if (event.type === "error") return { ...state, error: event.error };
  if (event.type === "run.started") {
    const current = conversation ?? {
      id: event.conversationId,
      projectPublicId: "",
      title: "",
      messages: [],
      runs: [],
      activeRunId: null,
    };
    const messages = [...current.messages];
    if (event.userMessage && !messages.some((message) => message.id === event.userMessage?.id))
      messages.push(event.userMessage);
    if (!messages.some((message) => message.id === event.assistantMessageId)) {
      messages.push({
        id: event.assistantMessageId,
        seq: event.seq,
        role: "assistant",
        createdAt: event.run.startedAt,
        runId: event.run.id,
        parts: [],
        partial: false,
      });
    }
    conversation = {
      ...current,
      id: event.conversationId,
      messages,
      runs: replaceRun(current.runs, event.run),
      activeRunId: event.run.id,
    };
  } else if (conversation && (event.type === "run.updated" || event.type === "run.finished")) {
    conversation = {
      ...conversation,
      runs: replaceRun(conversation.runs, event.run),
      activeRunId: event.type === "run.finished" ? null : conversation.activeRunId,
    };
  } else if (conversation && (event.type === "text.delta" || event.type === "tool.updated")) {
    const messages = conversation.messages.map((message): MessageView => {
      if (message.id !== event.messageId) return message;
      const parts = [...message.parts];
      if (event.type === "text.delta") {
        const last = parts.at(-1);
        if (last?.type === "text")
          parts[parts.length - 1] = { ...last, text: last.text + event.delta };
        else parts.push({ type: "text", text: event.delta });
      } else {
        const index = parts.findIndex(
          (part) => part.type === "tool" && part.call.id === event.call.id,
        );
        if (index < 0) parts.push({ type: "tool", call: event.call });
        else parts[index] = { type: "tool", call: event.call };
      }
      return { ...message, parts };
    });
    conversation = { ...conversation, messages };
  }
  return { ...state, conversation };
}

export function conversationReducer(
  state: ConversationState,
  event: AssistantStreamEvent,
): ConversationState {
  if (state.events.some((existing) => existing.seq === event.seq)) return state;
  const events = [...state.events, event];
  if (state.events.length === 0 || event.seq > state.events[state.events.length - 1].seq) {
    return { ...apply(state, event), events };
  }
  events.sort((a, b) => a.seq - b.seq);
  const rebuilt = events.reduce(apply, conversationState(state.base));
  return { ...rebuilt, events };
}
