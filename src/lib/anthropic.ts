const API_URL = "https://api.anthropic.com/v1/messages";
export const DEFAULT_MODEL = "claude-sonnet-5";

const SYSTEM_PROMPT = `You are a SQL generator for DuckDB (an in-browser analytics database).
You will be given a database schema (table names, column names, and column types only -
never any actual row data) and a natural-language question from a clinician or analyst
about data exported from Epic's EHI export.

Rules:
- Output ONLY a single valid DuckDB SQL statement. No markdown fences, no explanation, no comments.
- Only use tables and columns that appear in the schema. Never invent names.
- Only generate read-only queries: SELECT or WITH ... SELECT. Never DDL/DML (no INSERT, UPDATE,
  DELETE, DROP, ALTER, ATTACH, COPY, PRAGMA, CREATE).
- Quote identifiers with double quotes if they contain mixed case or special characters.
- If the question does not ask for an aggregate and could return many rows, add "LIMIT 500".
- If the question is ambiguous, make the most reasonable clinical/analytical interpretation
  and proceed rather than asking for clarification.
- If no table/column in the schema plausibly answers the question, output exactly:
  SELECT 'No matching data found for this question.' AS message`;

export class AnthropicError extends Error {}

function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/^```(?:sql)?\s*([\s\S]*?)\s*```$/i);
  return (fenceMatch ? fenceMatch[1] : trimmed).trim();
}

const FORBIDDEN = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|ATTACH|DETACH|COPY|PRAGMA|CREATE|CALL|EXPORT|IMPORT|INSTALL|LOAD)\b/i;

export function assertReadOnlySelect(sql: string): void {
  const statementCount = sql.split(";").filter((s) => s.trim().length > 0).length;
  if (statementCount > 1) {
    throw new AnthropicError("Only a single query statement is allowed.");
  }
  if (!/^\s*(SELECT|WITH)\b/i.test(sql)) {
    throw new AnthropicError("Only read-only SELECT queries are allowed.");
  }
  if (FORBIDDEN.test(sql)) {
    throw new AnthropicError("Query contains a disallowed statement type.");
  }
}

export async function generateSql(
  question: string,
  schemaDescription: string,
  apiKey: string,
  model: string = DEFAULT_MODEL,
): Promise<string> {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `SCHEMA:\n${schemaDescription}\n\nQUESTION: ${question}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    let detail = "";
    try {
      const body = await response.json();
      detail = body?.error?.message ?? JSON.stringify(body);
    } catch {
      detail = await response.text();
    }
    if (response.status === 401) {
      throw new AnthropicError("Invalid API key. Check it in Settings.");
    }
    throw new AnthropicError(`Claude API error (${response.status}): ${detail}`);
  }

  const data = await response.json();
  const text: string | undefined = data?.content?.find(
    (block: { type: string; text?: string }) => block.type === "text",
  )?.text;
  if (!text) {
    throw new AnthropicError("Claude returned no SQL.");
  }

  const sql = stripCodeFence(text);
  assertReadOnlySelect(sql);
  return sql;
}
