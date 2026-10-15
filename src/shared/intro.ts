import { splitAddresses } from './compose'

/**
 * Instant Intro (⌘⇧I): reply to an introduction by moving the introducer to Bcc and
 * adding a "Moving X to Bcc" line. The introducer is the sender of the message being replied to.
 */
export function instantIntro(
  draft: { to: string; cc: string; bcc: string; body: string },
  introducer: { name: string; email: string },
): { to: string; cc: string; bcc: string; body: string } {
  const isIntroducer = (entry: string) => entry.toLowerCase().includes(introducer.email.toLowerCase())
  const to = splitAddresses(draft.to).filter((entry) => !isIntroducer(entry))
  const cc = splitAddresses(draft.cc).filter((entry) => !isIntroducer(entry))
  const bcc = splitAddresses(draft.bcc)
  if (!bcc.some(isIntroducer)) bcc.push(introducer.email)
  // If the introducer was the only "To", promote Cc to To.
  const nextTo = to.length ? to : cc.splice(0, cc.length)
  const first = introducer.name.split(/\s+/)[0] || introducer.email
  const line = `Thanks ${first}! Moving you to Bcc to spare your inbox.`
  const body = draft.body.includes('to Bcc') ? draft.body : `${line}\n\n${draft.body}`.trimEnd() + (draft.body ? '' : '\n\n')
  return { to: nextTo.join(', '), cc: cc.join(', '), bcc: bcc.join(', '), body }
}
