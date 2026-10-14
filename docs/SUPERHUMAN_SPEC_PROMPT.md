# Prompt: produce a pixel-level UI/UX spec of Superhuman for DuperHuman

Paste everything below the line into an agent that can drive a real browser or desktop
session with a Superhuman account. The output goes into `docs/SUPERHUMAN_SPEC.md` in this
repo and becomes the acceptance checklist for the UI.

---

You are a product designer and front-end engineer doing a faithful teardown of the
Superhuman email client so that an open-source clone (DuperHuman, an Electron + React app)
can match its look and feel exactly. You have a machine with Superhuman installed and a
signed-in account. Click through the app yourself. Do not rely on memory, blog posts, or
marketing screenshots; measure the real thing.

Produce one Markdown document titled "Superhuman UI/UX spec" with the sections below.
Every claim must come from something you observed. Where you measured, give numbers in
CSS pixels at 1x. Where you could not measure, say "estimated" and explain how.

## 1. Design tokens
Use the browser's DevTools (Superhuman is a web app inside Electron; `View → Toggle
Developer Tools`, or press Cmd+Option+I) and read computed styles rather than guessing.
- Fonts: family, weights, sizes, line heights, letter spacing for: list sender, list
  subject, list snippet, list timestamp, thread title, message header name, message body,
  command palette input and rows, tooltips, keyboard hints, buttons.
- Colors, for BOTH the dark theme and the light theme, as hex: window background, list
  background, reading pane background, hover row, selected row, selected row edge or
  indicator, unread indicator, primary text, secondary text, tertiary text, dividers,
  accent (links, primary button), star color, danger, success, the composer background,
  overlay scrim, modal background, tooltip background. Include any gradients used for
  branding.
- Spacing and sizes: row height in the list, list width, gutters, padding in the reading
  pane, max content width of a message, avatar diameter, border radii on cards, modals,
  buttons and chips, shadow definitions on modals and popovers.
- Icons: which icon set or custom glyphs appear, their size, and stroke weight.

## 2. Layout
- Describe the top-level layout at 1280x800 and at 1680x1050: what panes exist, their
  widths, which resize, what collapses. Note the traffic-light placement and whether the
  title bar is hidden.
- Where the split tabs (Important, Other, and any custom splits) live, how counts are
  shown, how the active one is indicated.
- The thread list row anatomy: exactly what is on each line, truncation rules, how
  multi-participant threads are labeled, how the message count appears, what changes for
  unread vs read, starred, selected, hovered, multi-selected, snoozed, and with a label.
- The reading pane anatomy: title, labels, participant header, collapsed vs expanded
  messages, quoted text handling, attachments, inline images, remote image blocking
  notice, the "reply" affordance at the bottom.
- Empty states: Inbox zero screen, empty search, empty Other.

## 3. Interactions and motion
For each, record timing and easing where you can see it (DevTools → Animations panel):
- Moving selection with j/k, including scroll behavior at list edges.
- Marking done (e): what animates, how the list closes the gap, what the toast looks like
  and how long it stays, where "Undo" appears.
- Snooze (h): the exact menu, its options and their default times, keyboard navigation,
  custom time entry, the confirmation.
- Reply/reply all/forward: where the composer appears, its size, whether it pushes the
  thread up or overlays it, the To/Cc/Bcc chip behavior, send button and shortcut, how
  "sent" is confirmed, undo send timing.
- Command palette (Cmd+K): width, position, search behavior, row anatomy, how shortcuts
  are displayed on the right, grouping, fuzzy matching behavior.
- Search (/): where it opens, the syntax hints, how results replace the list.
- Shortcuts overlay (?): layout and grouping.
- Hover tooltips: delay, style, whether they show shortcuts.
- Toasts: position, stacking, duration, style.
- Any onboarding or "get started" surfaces for a new account.

## 4. Keyboard map
List every shortcut you can find, from the shortcuts overlay and by testing. Give the key,
the action, and whether it works in the list, in the reading pane, and in the composer.
Note two-key sequences (for example g then i) and their timeout.

## 5. AI features
Describe exactly how Superhuman AI appears: where the entry points are, the "Write with
AI" flow, Instant Reply, Auto Summarize at the top of a thread, Ask AI. For each, screenshot
the UI and describe states: idle, loading, streaming, done, error.

## 6. Screenshots
Capture and attach PNGs at 2x of: Important list with a selected thread, a thread with
three or more messages, the composer open, the snooze menu, the command palette, the
shortcuts overlay, the Inbox zero screen, the light theme equivalent of the first one.
Name them `superhuman-<surface>-<theme>.png`.

## 7. Differences to decide
Finish with a list of behaviors that depend on Superhuman's backend (for example instant
search, read receipts, calendar sidebar, team comments) and say whether a Gmail API client
can reproduce each one, approximately, or not at all.

Constraints: do not change any account settings, do not send email, do not delete anything.
Reading, scrolling, opening menus, and screenshots only. If an action would send or delete,
stop and describe it instead.
