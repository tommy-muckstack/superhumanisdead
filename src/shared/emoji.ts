/** ":smile" style emoji in the composer. A compact set of the most used shortcodes. */
export const EMOJI: Record<string, string> = {
  smile: '😄', grin: '😁', joy: '😂', rofl: '🤣', wink: '😉', blush: '😊', heart_eyes: '😍', thinking: '🤔', sweat_smile: '😅',
  sob: '😭', cry: '😢', sunglasses: '😎', upside_down: '🙃', raised_eyebrow: '🤨', shrug: '🤷', facepalm: '🤦', eyes: '👀',
  thumbsup: '👍', '+1': '👍', thumbsdown: '👎', clap: '👏', pray: '🙏', wave: '👋', muscle: '💪', ok_hand: '👌', point_right: '👉',
  raised_hands: '🙌', handshake: '🤝', heart: '❤️', fire: '🔥', sparkles: '✨', star: '⭐', tada: '🎉', rocket: '🚀', '100': '💯',
  check: '✅', white_check_mark: '✅', x: '❌', warning: '⚠️', bulb: '💡', memo: '📝', calendar: '📅', email: '📧', phone: '📞',
  coffee: '☕', beers: '🍻', pizza: '🍕', cake: '🎂', sun: '☀️', moon: '🌙', zap: '⚡', chart: '📈', money: '💰', lock: '🔒',
  hourglass: '⏳', alarm: '⏰', pin: '📌', link: '🔗', gift: '🎁', trophy: '🏆', skull: '💀', ghost: '👻', robot: '🤖', see_no_evil: '🙈',
}

/** Detect ":query" right before the caret (at least 2 characters, like Superhuman). */
export function emojiTrigger(text: string, caret: number): { query: string; start: number } | null {
  const match = /(^|\s):([a-z0-9_+]{2,})$/.exec(text.slice(0, caret))
  if (!match) return null
  const query = match[2] ?? ''
  return { query, start: caret - query.length - 1 }
}

export function emojiMatches(query: string, limit = 6): { code: string; char: string }[] {
  const q = query.toLowerCase()
  return Object.entries(EMOJI)
    .filter(([code]) => code.includes(q))
    .sort(([a], [b]) => Number(!a.startsWith(q)) - Number(!b.startsWith(q)) || a.length - b.length)
    .slice(0, limit)
    .map(([code, char]) => ({ code, char }))
}
