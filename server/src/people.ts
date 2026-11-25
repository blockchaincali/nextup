// Finding the person in an event that has no guests, from its title:
// "Coffee with Daniel Reyes", "Call w/ Priya", "Lunch: Sam Okafor", "Daniel <> Alex".

const NAME = "[A-Z][\\p{L}'’-]+(?:\\s+[A-Z][\\p{L}'’-]+){0,2}"
const PATTERNS = [
  new RegExp(`\\b(?:with|w\\/|meet(?:ing)?|call|coffee|lunch|dinner|drinks|breakfast|catch[- ]?up|1:1|intro|chat)\\s*[:\\-–]?\\s+(${NAME})`, 'u'),
  new RegExp(`^(${NAME})\\s*(?:<>|\\/|x|&)\\s*`, 'u'),
  new RegExp(`^(?:call|meeting|coffee|lunch|dinner|1:1)\\s*[:\\-–]\\s*(${NAME})`, 'iu'),
]
// Capitalised words that are not people.
const NOT_NAMES = new Set(['Team', 'The', 'Weekly', 'Daily', 'Monthly', 'Sync', 'Standup', 'Review', 'Board', 'Client', 'Investor', 'Investors', 'Partner', 'Partners', 'Sales', 'Product', 'Design', 'Marketing', 'Zoom', 'Google', 'Meet', 'Teams', 'Me'])

export function personFromTitle(title: string): string | undefined {
  for (const re of PATTERNS) {
    const m = title.match(re)
    if (!m?.[1]) continue
    const words = m[1].split(/\s+/).filter((w) => !NOT_NAMES.has(w))
    // Stop at the first word that isn't a name ("Daniel Reyes Harbor" is rare; "Priya Friday" isn't).
    const name = words.filter((w) => !/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Re|Fwd)$/.test(w)).join(' ')
    if (name) return name
  }
  return undefined
}

/** "Daniel Reyes <daniel@x.com>" → { name, email } */
export function parseAddress(header: string): { name: string; email: string } | undefined {
  const m = header.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/) ?? header.match(/^\s*()([^\s@]+@[^\s@]+)\s*$/)
  if (!m) return undefined
  return { name: m[1]!.trim(), email: m[2]!.trim().toLowerCase() }
}
