import { z } from "zod";

const MODEL = process.env.GROQ_MODEL ?? "openai/gpt-oss-120b";
const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

/** Groq's strict structured-output mode follows the OpenAI subset: every object
 *  must list all its keys in `required` and set `additionalProperties: false`,
 *  and validation keywords (minimum, pattern, …) are not allowed. Zod emits a
 *  richer schema than that, so walk it and cut it down. */
const UNSUPPORTED = [
  "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf",
  "minLength", "maxLength", "pattern", "format",
  "minItems", "maxItems", "uniqueItems", "default",
];

function toStrictSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(toStrictSchema);
  if (node === null || typeof node !== "object") return node;

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    if (k === "$schema" || UNSUPPORTED.includes(k)) continue;
    out[k] = toStrictSchema(v);
  }
  if (out.type === "object" && out.properties) {
    out.required = Object.keys(out.properties as object);
    out.additionalProperties = false;
  }
  return out;
}

export class GroqError extends Error {}

/** One constrained-decoding call. Returns a parsed, typed object or throws. */
export async function groqJSON<T extends z.ZodType>(opts: {
  schema: T;
  name: string;
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<z.infer<T>> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new GroqError("GROQ_API_KEY is not set. Copy .env.example to .env.local.");

  const send = () => fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: MODEL,
      temperature: opts.temperature ?? 0.7,
      max_completion_tokens: opts.maxTokens ?? 1500,
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: opts.name,
          strict: true,
          schema: toStrictSchema(z.toJSONSchema(opts.schema, { io: "output" })),
        },
      },
    }),
  });

  // A session spends four calls, which overruns the free tier's 8k tokens-per-minute.
  // One wait usually clears it; longer than 20s means the budget is genuinely gone.
  let res = await send();
  if (res.status === 429) {
    const wait = Number(res.headers.get("retry-after") ?? 5);
    if (wait > 20) throw new GroqError(`Groq rate limit: retry in ${Math.ceil(wait)}s.`);
    await new Promise((r) => setTimeout(r, wait * 1000));
    res = await send();
  }

  if (!res.ok) {
    const body = await res.text();
    throw new GroqError(`Groq ${res.status}: ${body.slice(0, 400)}`);
  }

  const json = await res.json();
  // Truncation otherwise surfaces as "malformed JSON" below and sends you hunting a schema bug.
  if (json?.choices?.[0]?.finish_reason === "length")
    throw new GroqError(`Response hit max_completion_tokens (${opts.maxTokens ?? 1500}). Raise it or ask for less.`);
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new GroqError("Groq returned no content.");

  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    throw new GroqError("Groq returned malformed JSON despite strict mode.");
  }

  const parsed = opts.schema.safeParse(raw);
  if (!parsed.success) throw new GroqError(`Schema mismatch: ${parsed.error.message.slice(0, 300)}`);
  return parsed.data;
}

export const clamp = (n: number, lo = 0, hi = 100) =>
  Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : Math.round((lo + hi) / 2);
