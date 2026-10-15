import type { Split, ThreadSummary } from './types'

export const OTHER_CATEGORIES = ['CATEGORY_PROMOTIONS', 'CATEGORY_SOCIAL', 'CATEGORY_UPDATES', 'CATEGORY_FORUMS']

export const SPLITS: { id: Split; label: string; hint: string }[] = [
  { id: 'important', label: 'Important', hint: 'People writing to you' },
  { id: 'other', label: 'Other', hint: 'Newsletters, updates, promotions' },
  { id: 'starred', label: 'Starred', hint: '' },
  { id: 'snoozed', label: 'Snoozed', hint: '' },
  { id: 'drafts', label: 'Drafts', hint: '' },
  { id: 'sent', label: 'Sent', hint: '' },
  { id: 'done', label: 'Done', hint: 'Archived' },
  { id: 'spam', label: 'Spam', hint: '' },
  { id: 'trash', label: 'Trash', hint: '' },
  { id: 'all', label: 'All Mail', hint: '' },
]

export function isOther(thread: ThreadSummary): boolean {
  return thread.labelIds.some((label) => OTHER_CATEGORIES.includes(label))
}

export function inboxSplit(thread: ThreadSummary): 'important' | 'other' {
  return isOther(thread) ? 'other' : 'important'
}

/** Gmail search query for a split. Snoozed is local-only and has no query. */
export function queryForSplit(split: Split): { q?: string; labelIds?: string[] } {
  switch (split) {
    case 'important':
      return { labelIds: ['INBOX'], q: '-category:promotions -category:social -category:updates -category:forums' }
    case 'other':
      return { labelIds: ['INBOX'], q: '(category:promotions OR category:social OR category:updates OR category:forums)' }
    case 'starred':
      return { labelIds: ['STARRED'] }
    case 'sent':
      return { labelIds: ['SENT'] }
    case 'drafts':
      return { labelIds: ['DRAFT'] }
    case 'done':
      return { q: '-in:inbox -in:sent -in:drafts -in:spam -in:trash' }
    case 'spam':
      return { labelIds: ['SPAM'] }
    case 'trash':
      return { labelIds: ['TRASH'] }
    case 'all':
      return {}
    case 'snoozed':
      return {}
  }
}
