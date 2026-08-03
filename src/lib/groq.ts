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

  const budget = opts.maxTokens ?? 1500;
  const send = (maxTokens: number) => fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: MODEL,
      temperature: opts.temperature ?? 0.7,
      max_completion_tokens: maxTokens,
      // Reasoning tokens are spent out of max_completion_tokens. At the default effort
      // gpt-oss can burn the whole budget thinking and emit nothing, which comes back as
      // a 400 json_validate_failed with an empty failed_generation. Raise to "medium" if
      // curation quality drops — but raise the token budgets in the same move.
      reasoning_effort: "low",
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

  // Two things go wrong on the free tier, and both are transient:
  //   429            — a session's calls overrun the 8k tokens-per-minute budget.
  //   400 json_validate_failed — the generation was cut off mid-JSON, so strict decoding
  //                    never closed the object. Groq reports this instead of
  //                    finish_reason: "length", which is why the check below rarely fires.
  // Retry each once: the 429 after the window Groq names, the truncation with more room.
  let tokens = budget;
  let res = await send(tokens);
  for (let retries = 0; retries < 2 && !res.ok; retries++) {
    if (res.status === 429) {
      const wait = Math.min(Number(res.headers.get("retry-after") ?? 5), 30);
      await new Promise((r) => setTimeout(r, (wait + 1) * 1000));
    } else if (res.status === 400 && (await res.clone().text()).includes("json_validate_failed")) {
      tokens = Math.min(Math.ceil(tokens * 1.6), 8000);
    } else {
      break;
    }
    res = await send(tokens);
  }

  if (!res.ok) {
    const body = await res.text();
    if (res.status === 429)
      throw new GroqError("The model is rate limited right now. Wait a minute and try again.");
    if (body.includes("json_validate_failed"))
      throw new GroqError("The model ran out of room mid-answer. Try again, or ask for a shorter playlist.");
    throw new GroqError(`Groq ${res.status}: ${body.slice(0, 400)}`);
  }

  const json = await res.json();
  // Truncation otherwise surfaces as "malformed JSON" below and sends you hunting a schema bug.
  if (json?.choices?.[0]?.finish_reason === "length")
    throw new GroqError(`Response hit max_completion_tokens (${tokens}). Raise it or ask for less.`);
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
