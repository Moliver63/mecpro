export function completeGeminiText(data: any): string {
  const candidate = data?.candidates?.[0];
  if (candidate?.finishReason !== "STOP") {
    const reason = ["MAX_TOKENS", "SAFETY", "RECITATION"].includes(candidate?.finishReason) ? candidate.finishReason : "INCOMPLETE";
    throw new Error(`gemini_response_incomplete:${reason}`);
  }
  const text = (candidate.content?.parts || [])
    .filter((part: any) => !part.thought && typeof part.text === "string")
    .map((part: any) => part.text).join("").trim();
  if (!text) throw new Error("gemini_response_incomplete:EMPTY");
  return text;
}
