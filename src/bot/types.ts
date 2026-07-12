import type { Context, SessionFlavor } from "grammy";
import type { ConversationFlavor } from "@grammyjs/conversations";

export interface SessionData {
  /** Cached PIN for current session (cleared after each use) */
  pendingPin?: string;
  /** Selected wallet ID for current operation */
  selectedWalletId?: number;
  /** Step in onboarding */
  onboardingStep?: string;
}

type BaseContext = Context & SessionFlavor<SessionData>;

export type MyContext = ConversationFlavor<BaseContext>;
