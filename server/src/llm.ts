// LLM calls through OpenRouter (or any OpenAI-compatible endpoint), always
// asking for JSON so the glasses get predictable, short fields.
import { config } from './config.js'

export async function llmJson<T>(system: string, user: string, maxTokens = 700): Promise<T> {
  let res = await chat(system, user, maxTokens, true)
  // Some providers reject response_format; the prompt already asks for JSON, so retry without it.
  if (res.status === 400 || res.status === 422) res = await chat(system, user, maxTokens, false)
  if (!res.ok) throw new Error(`LLM ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const data = (await res.json()) as { choices: Array<{ message: { content: string } }> }
  const text = data.choices[0]?.message.content ?? '{}'
  const json = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)
  return JSON.parse(json || '{}') as T
}

function chat(system: string, user: string, maxTokens: number, jsonMode: boolean) {
  return fetch(`${config.llm.baseUrl}/chat/completions`, {
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
      ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: `${user}\n\nReply with JSON only.` },
      ],
    }),
  })
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
