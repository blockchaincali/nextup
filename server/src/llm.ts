// LLM calls through OpenRouter (or any OpenAI-compatible endpoint), always
// asking for JSON so the glasses get predictable, short fields.
import { config } from './config.js'

export async function llmJson<T>(system: string, user: string, maxTokens = 700): Promise<T> {
  const res = await fetch(`${config.llm.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.llm.apiKey}`,
      'content-type': 'application/json',
      'http-referer': config.publicUrl,
      'x-title': 'Next Up',
    },
    body: JSON.stringify({
      model: config.llm.model,
      temperature: 0.2,
      max_tokens: maxTokens,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  })
  if (!res.ok) throw new Error(`LLM ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const data = (await res.json()) as { choices: Array<{ message: { content: string } }> }
  const text = data.choices[0]?.message.content ?? '{}'
  return JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, '')) as T
}

/** Cut to a hard character limit on a word boundary, so nothing overflows the 576 px line. */
export function fit(s: string, max: number): string {
  const clean = glyphSafe(s).replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  const cut = clean.slice(0, max - 1)
  const space = cut.lastIndexOf(' ')
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[,.;:\s]+$/, '')}…`
}

/** The G2 font is limited: swap typographic quotes and dashes for plain ones. */
export function glyphSafe(s: string): string {
  return s
    .replace(/[\u2018\u2019\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201F]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
}
