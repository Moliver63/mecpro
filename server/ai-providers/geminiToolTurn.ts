import type { Content, GenerateContentResponse, Part } from "@google/genai";

/** Preserve opaque provider metadata; every function call needs a matching response. */
export async function appendGeminiToolTurn(
  history: Content[],
  response: GenerateContentResponse,
  execute: (name: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>,
): Promise<boolean> {
  const content = response.candidates?.[0]?.content;
  const calls = content?.parts?.flatMap(part => part.functionCall ? [part.functionCall] : []) ?? [];
  if (!calls.length) return false;
  if (calls.some(call => !call.name)) throw new Error("Gemini returned an unnamed function call");
  history.push(content!);
  const parts: Part[] = [];
  for (const call of calls) {
    const result = await execute(call.name!, call.args ?? {});
    parts.push({ functionResponse: {
      ...(call.id ? { id: call.id } : {}), name: call.name!, response: result,
    } });
  }
  history.push({ role: "user", parts });
  return true;
}
