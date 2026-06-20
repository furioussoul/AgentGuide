import type { MessageParam } from "../model/types.js";

export function trimMessages(messages: MessageParam[], maxMessages: number): MessageParam[] {
  if (messages.length <= maxMessages) return messages;
  const kept = messages.slice(-maxMessages);
  return [
    {
      role: "user",
      content:
        "Earlier conversation was trimmed to keep the demo context small. Re-inspect files or rerun tools when facts are needed.",
    },
    ...kept,
  ];
}
