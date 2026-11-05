// Lifeline — built-in assistant powered by Claude, using the user's own API key.
// The key is stored only inside the encrypted vault and sent only to api.anthropic.com.
import type Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT } from "./ai";

export const CLAUDE_MODEL = "claude-opus-5-5";

export type ChatTurn = Anthropic.Beta.BetaMessageParam;

export interface AskResult { text: string; refused: boolean; history: ChatTurn[] }

export class AssistantError extends Error {
  kind: "auth" | "rate" | "offline" | "server" | "bad-request";
  constructor(kind: AssistantError["kind"], message: string) { super(message); this.kind = kind; }
}

/**
 * Sends the conversation to Claude and streams the answer.
 * `history` is append-only: the assistant's full content blocks are kept so follow-up turns stay valid.
 */
export async function askClaude(apiKey: string, context: string, history: ChatTurn[], question: string, onText: (delta: string) => void, signal?: AbortSignal): Promise<AskResult> {
  const { default: AnthropicSDK } = await import("@anthropic-ai/sdk");
  // Browser use is intentional here: it's the user's own key on their own device (bring-your-own-key).
  const client = new AnthropicSDK({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 });
  const messages: ChatTurn[] = [...history, { role: "user", content: question }];
  try {
    const stream = client.beta.messages.stream({
      model: CLAUDE_MODEL,
      max_tokens: 16000,
      output_config: { effort: "medium" },
      // If the model declines for safety reasons, the API retries on a suitable fallback model automatically.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: [
        { type: "text", text: SYSTEM_PROMPT },
        { type: "text", text: "User's current financial summary:\n" + context },
      ],
      messages,
    }, { signal });
    stream.on("text", delta => onText(delta));
    const msg = await stream.finalMessage();
    const text = msg.content.flatMap(b => (b.type === "text" ? [b.text] : [])).join("");
    const refused = msg.stop_reason === "refusal";
    return {
      text: refused && !text ? "I can't help with that request. Try rephrasing it as a question about your budget, EMIs or savings." : text,
      refused,
      history: [...messages, { role: "assistant", content: msg.content }],
    };
  } catch (e) {
    if (e instanceof AnthropicSDK.AuthenticationError || e instanceof AnthropicSDK.PermissionDeniedError) throw new AssistantError("auth", "Your Claude API key was rejected. Check it in Connected apps.");
    if (e instanceof AnthropicSDK.RateLimitError) throw new AssistantError("rate", "Too many requests right now. Wait a minute and try again.");
    if (e instanceof AnthropicSDK.BadRequestError) throw new AssistantError("bad-request", "The request couldn't be processed. Try a shorter question.");
    if (e instanceof AnthropicSDK.APIConnectionError) throw new AssistantError("offline", "Can't reach Claude. Check your internet connection.");
    if (e instanceof AnthropicSDK.APIError) throw new AssistantError("server", `Claude is unavailable (error ${e.status ?? "?"}). Try again shortly.`);
    throw e;
  }
}

export const looksLikeAnthropicKey = (k: string) => /^sk-ant-[A-Za-z0-9_-]{20,}$/.test(k.trim());
