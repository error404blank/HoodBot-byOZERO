import type { Conversation } from "@grammyjs/conversations";
import type { MyContext } from "../types";

/**
 * Waits for a text message. If the user sends /cancel (or "cancel"),
 * replies with a cancel message and throws a special error to exit
 * the conversation cleanly.
 *
 * Usage:
 *   const msg = await waitOrCancel(conversation, ctx);
 *   const text = msg.message.text.trim();
 */
export async function waitOrCancel(
  conversation: Conversation<MyContext, MyContext>,
  ctx: MyContext
): Promise<Awaited<ReturnType<typeof conversation.waitFor<"message:text">>>> {
  const msg = await conversation.waitFor("message:text");
  const text = msg.message.text.trim().toLowerCase();
  if (text === "/cancel" || text === "cancel") {
    await ctx.reply("Action cancelled. Use /start to return to the main menu.");
    throw new CancelledError();
  }
  return msg;
}

export class CancelledError extends Error {
  constructor() {
    super("Cancelled by user");
    this.name = "CancelledError";
  }
}
