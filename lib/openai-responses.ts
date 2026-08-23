export type OpenAIInputContent =
  | { type: "input_text"; text: string }
  | { type: "input_image"; image_url: string; detail?: "low" | "high" | "auto" };

type StructuredResponseOptions = {
  apiKey: string;
  model: string;
  system: string;
  content: OpenAIInputContent[];
  schemaName: string;
  schema: Record<string, unknown>;
  maxOutputTokens?: number;
};

function outputText(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const response = payload as { output_text?: unknown; output?: unknown };
  if (typeof response.output_text === "string") return response.output_text;
  if (!Array.isArray(response.output)) return "";
  for (const item of response.output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const text = (part as { text?: unknown }).text;
      if (typeof text === "string") return text;
    }
  }
  return "";
}

export async function createStructuredResponse<T>(options: StructuredResponseOptions): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "authorization": `Bearer ${options.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: options.model,
        store: false,
        max_output_tokens: options.maxOutputTokens ?? 1200,
        input: [
          { role: "system", content: options.system },
          { role: "user", content: options.content },
        ],
        text: {
          format: {
            type: "json_schema",
            name: options.schemaName,
            strict: true,
            schema: options.schema,
          },
        },
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      console.error("[fluxo:openai] request failed", { status: response.status });
      throw new Error(response.status === 429 ? "AI_RATE_LIMITED" : "AI_PROVIDER_FAILED");
    }
    const payload = await response.json();
    const text = outputText(payload);
    if (!text) throw new Error("AI_EMPTY_RESPONSE");
    try { return JSON.parse(text) as T; }
    catch { throw new Error("AI_INVALID_RESPONSE"); }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("AI_TIMEOUT");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
