import type { Label } from './types'

/** System labels that make sense as folders in the ← menu and label pickers. */
const HIDDEN = new Set(['UNREAD', 'IMPORTANT', 'CHAT', 'DRAFT', 'SENT', 'SPAM', 'TRASH', 'STARRED', 'INBOX', 'CATEGORY_PERSONAL', 'CATEGORY_SOCIAL', 'CATEGORY_PROMOTIONS', 'CATEGORY_UPDATES', 'CATEGORY_FORUMS'])
export const MUTED_LABEL = 'SuperhumanIsDead/Muted'

export function userLabels(labels: Label[]): Label[] {
  return labels.filter((label) => label.type === 'user' && !HIDDEN.has(label.id) && label.name !== MUTED_LABEL).sort((a, b) => a.name.localeCompare(b.name))
}

/** Changes to apply to a thread when toggling a label: add if any target lacks it, else remove. */
export function toggleLabelChange(threadsLabelIds: string[][], labelId: string): { add: string[]; remove: string[] } {
  const all = threadsLabelIds.every((ids) => ids.includes(labelId))
  return all ? { add: [], remove: [labelId] } : { add: [labelId], remove: [] }
}

/** Move (V): add the destination and leave the inbox. Moving to "Inbox" restores. */
export function moveChange(labelId: string): { add: string[]; remove: string[] } {
  return labelId === 'INBOX' ? { add: ['INBOX'], remove: [] } : { add: [labelId], remove: ['INBOX'] }
}

/** Y removes the label of the folder being viewed (Gmail semantics); in the inbox it archives. */
export function removeCurrentLabel(viewLabelId: string | null): { add: string[]; remove: string[] } {
  return { add: [], remove: [viewLabelId ?? 'INBOX'] }
}

/** ⇧Y removes every user label from the thread. */
export function removeAllLabels(labelIds: string[], labels: Label[]): { add: string[]; remove: string[] } {
  const user = new Set(labels.filter((label) => label.type === 'user').map((label) => label.id))
  return { add: [], remove: labelIds.filter((id) => user.has(id)) }
}
