# Superhuman UI/UX spec

Teardown of **Superhuman Mail** (the in-product name; the window title still says "Superhuman") for DuperHuman, the Electron + React clone. This follows `docs/SUPERHUMAN_SPEC_PROMPT.md`.

- **Captured:** 2026-10-14 (ET) on the Mac Mini.
- **Build:** `Superhuman.app` 1041.0.72, Electron.
- **Account:** `a research account`, an Outlook/Microsoft 365 account on the free trial month.
- **Screenshots:** the PNGs are in `docs/superhuman-shots/`. They are 1024-px-wide downsamples of 2x Retina captures, so they are not true 2x.

**Provenance tags.** Each claim carries one of these tags.
- **[LIVE]**: seen or measured in the running app.
- **[BUNDLE]**: read from the app's `app.asar`, read-only.
- **[PUB]**: public docs, with a URL.
- **[GUESS]**: inference, clearly labelled.

**Measurement method.** DevTools could not be opened (see §8), so I could not read computed styles. Instead I sampled pixels from full-resolution screenshots of a 1920×1080-pt display, either full screen or a 1280×800 window. Values are CSS px at 1x and are accurate to about ±1 px. Colors come from flat fills and are exact. Font metrics are estimates.

**Outlook vs Gmail.** This account is Outlook, so some names differ from the Gmail build:
- Star is called **Flag**.
- Trash is called **Delete**, and Spam is called **Junk**.
- Labels map to Outlook **categories** and folders.

Gmail-variant names come from the public shortcut PDF and are noted where relevant.

---

## 0. Architecture (bundle findings and guesses)

**From the bundle [BUNDLE]**
- `app.asar` is 34.5 MB. It contains `dist/main.js`, `index.js`, `foreground_preload.js`, `background_preload.js`, `window_preload.js`, `tabs.html` and `browserWindow.html`.
- The UI itself is not in the bundle. Electron loads the web app from `https://mail.superhuman.com`, and the native shell only wraps it.
- **Other hosts referenced:**
  - `accounts.`, `admin.`, `settings.`, `calendar.`, `links.` (shared links and booking pages)
  - `media.`, `assets.mail.`, `r.superhuman.com` (redirects and tracking)
  - `download.superhuman.com`
  - a `mail.staging-superhuman.com` build host
- **Process model:** a **foreground** renderer (the visible UI) plus a **background** renderer with its own preload. The menu has "Toggle Foreground / Background / Window / Tabs Developer Tools".
  - [GUESS] The background renderer runs sync and indexing (the local IndexedDB/SQLite search cache) and the push receiver, so the foreground never blocks on network I/O.
- **Tabs:** native tabs built with `BrowserView` and `tabs.html`. The menu has New Tab Cmd+T, Next/Previous Tab Cmd+Shift+]/[, Close Tab Cmd+W and New Window Cmd+N.
- **Push:** `@superhuman/electron-push-receiver` (FCM/GCM).
- **Other dependencies:** `electron-store` for preferences, `electron-updater`, Bugsnag, `systeminformation`, and React 17 in the shell.
- **Preferences keys:** `spellCheckerEnabled`, `enabledOpenAtLogin`, `downloadsLocation`, `setAsDefaultClientOnInstall`, `addedToDock`, `declinedMoving`, `hardwareArchitecture`, `webCodeResetAt`.
- **Native menu:**
  - **File:** New Window, New Tab, Close Tab, Close Window, Print (Cmd+P), Set as Default Email Client, Hide at Login, Clear Cache and Restart.
  - **Edit:** Cut, Copy, Paste, Paste and Match Style (Shift+Cmd+V), Enable Autocorrect, Add to Dictionary.
  - **View:** Reload, Toggle Full Screen, dev tools.
  - **App menu:** Check for Updates (the updater states are listed below).
  - **Context menu:** Open Link, Copy Image, Copy Image URL, Search with Google, Inspect Element.
  - **Updater states:** "Checking…", "Downloading…", "Install Update and Restart", "Preparing to Install…", "Restarting…".
- **Info.plist:**
  - URL schemes `superhuman://` and `mailto` (it registers as the mail handler).
  - Camera, microphone and audio-capture usage strings (used by Write with Voice).
  - `NSPrincipalClass AtomApplication`.

**Older search engine [PUB]**
- Search ran on a local WebSQL full-text table, `message_search`, plus `threads` and `thread_labels` tables.
- A Gmail-syntax parser turns the query into an AST that compiles to SQL (`INTERSECT` for AND, `UNION` for OR).
- Source: https://blog.superhuman.com/delightful-search-more-than-meets-the-eye/
- A later rewrite cut queries from about 3 s to about 30 ms (https://new.superhuman.com/blazingly-fast-search-29119).
- Help notes that search works offline on recent mail (https://help.superhuman.com/hc/en-us/articles/46005672652301-Search).

**[GUESS] Recommended architecture for DuperHuman**
- **Local store:** SQLite FTS5 in the main or utility process, with tables for threads, messages, labels, contacts and drafts.
- **Sync:** a worker against the Gmail and Graph APIs, using `historyId` and delta tokens.
- **UI:** reads only from the local store, so every action is optimistic.
- **Server queue:** a small server for send-later, reminders, read-status pixels, shared conversations and push. These need to run while the app is closed.

## 1. Design tokens

### Colors, light theme ("Superhuman" style) [LIVE, pixel-sampled]

| Token | Hex | Where |
|---|---|---|
| window / list / reading bg | `#FFFFFF` | main panes |
| right context panel bg | `#FCFAF7` | warm off-white; contact, settings and Recent Opens sidebar |
| pane dividers | `#DEDBD5` | 1 px vertical rules: left rail and right panel |
| selected row bg | `#F7F5FF` | pale lavender |
| selected row edge | `#714CB6` | ~3 px solid bar at the row's left edge; also the accent purple and the compose left rule |
| unread dot | `#71C0EA` | light blue, ~5 px; sits left of the sender name |
| primary text | `#141414` | sender, subject |
| secondary text | `#73716D` | snippet, timestamp |
| bottom hint bar bg | `#EDEEFA` | with a pink-to-lavender gradient tint at the bottom edge (visible in shots) |
| primary button | ~`#5B3FA8`–`#714CB6` | e.g. "Get Started" and "Next"; solid purple, white text |
| AI prompt field | lavender-to-pink gradient border | Write with AI input (see `superhuman-write-with-ai-light.png`) |
| Remind Me / Command palette | dark popover ~`#1E1E1E`–`#2A2A2A` | **dark even in the light theme**; light-gray monospace text; selected row lighter gray |
| tooltip | dark gray, white text | e.g. "Remind yourself at the perfect time. Try "monday" or even "2d"!" |
| toast | white card with blue left bar | "Draft discarded. Undo ×", bottom-left |

**Category and auto-label chips [LIVE]**
- Chips are pastel fills with darker text of the same hue.
- `marketing` is orange/peach, `news` is yellow, `pitch` is light blue, `social` is lavender-blue.
- `team`, `quality`, `product`, `order` and `notifications` appear in the onboarding art.

**Themes [LIVE]**
- **Style:** Superhuman or Classic.
- **Appearance:** Match System, Light or Dark.
- The palette also has "Set Theme: Dark", "Set Theme: Match macOS" and "Set Theme Style: Classic".
- Not captured: I didn't switch the dark theme on, to avoid changing settings. Its hex values are still to be measured.

### Typography [LIVE, estimated]

| Element | Estimate |
|---|---|
| Body font | Superhuman's own geometric grotesk, close to *Suisse Int'l / Inter*. Use Inter as a stand-in. |
| Remind Me and palette input | **monospace** (e.g. `Type "monday" or "2d"`), close to *SF Mono / Menlo* |
| List rows | 13 px. Sender is weight 600 when unread and 500 when read; subject is 500 in `#141414`; snippet is 400 in `#73716D`. |
| Timestamps | 12 px. Absolute times ("4:49 PM"); older items use uppercase short dates ("OCT 13"). |
| Section headers | "Last 7 days" and "Earlier this month" at 12 px in secondary color |
| Thread title | ~22 px, weight 500 |
| Message body | ~14 px, line height ~1.6 |
| Onboarding H1 | ~28–32 px |
| Inbox Zero headline | ~44 px, white, over a full-bleed landscape photo |

### Spacing and sizes [LIVE, measured on the 1920 pt full screen]

| Element | Measurement |
|---|---|
| Left icon rail | 39 px wide plus a 1 px divider. Icons: pin/compose at top, Mail, Calendar. |
| Right context panel | 422 px at 1920 width (it starts at x=1498). At 1280 it is about 325 px. |
| Thread list | fills the rest. List rows are ~36 px tall with no row borders, one line each. |
| Reading pane / composer | a centered card ~710 px wide (x 331–710 of 1024 → ~712 pt), white with a soft shadow and a 3 px purple left rule on the active message |
| Bottom hint bar | ~18 px tall. Shows "Hit E to Mark Done · H to set a reminder · C to compose · / to search · ⌘K for Superhuman Command", with an × at the right. |
| Command / Remind Me popover | ~680 px wide, ~8 px radius, centered horizontally. Its top is about 25% down the window. |
| Avatars | ~56 px circle in the contact panel, with a small app badge |
| Radii | buttons ~6 px, cards ~8 px, chips ~4 px |
| Shadows | modals and popovers use a large soft blur (~0 8 32 rgba(0,0,0,.18) [GUESS]) |

### Icons [LIVE]

- Thin-stroke (~1.5 px) monochrome line icons at 16 px.
- **Row hover actions, right-aligned:** ✓ Done, clock (Remind), lightning (Instant Reply/AI).
- **List header:** compose and search icons.
- **Contact panel footer:** gift (refer), help, mobile, calendar, settings gear.
- **Composer toolbar, right side:**
  - AI sparkle-pen
  - calendar (insert availability)
  - `{}` (snippets)
  - paperclip
  - trash

## 2. Layout

**Top level at 1280×800 [LIVE]**
- **Hidden title bar.** The traffic lights sit inline at the top left (~x 18, y 13). With tabs on, a native tab strip with an address-style title ("Important (5) - Superhuman") and a + button appears.
- **Columns, left to right:**
  - icon rail (39 px)
  - list or reading pane (flex)
  - context panel (~325 px; 422 px at 1920)
- The context panel shows one of: the contact for the selected thread, Recent Opens (Business), Settings, the Shortcuts reference, Ask AI, or search operators.
- On a new account a **"Finish your account setup"** checklist card sits pinned in the bottom half of the context panel:
  - Set up your first inbox
  - Add more email accounts
  - Download our mobile app
  - Connect to ChatGPT, Claude, & more
  - Learn more ways to work faster
  - It has a purple progress bar.
- Panel footer: "Create Team" plus icons.

**Splits [LIVE]**
- Inline in the list header: `≡  Important 5 · Other 1  + Add Split`.
- The active split is bold and black; inactive ones are gray. The count sits next to each name in small gray type.
- Tab and Shift+Tab cycle splits.
- Splits in the Split Inbox settings:
  - **Important**: "Direct, personal, and high priority messages"
  - **Other**: "Split conversations from marketing, social networks, and automatic updates"
  - "Hide Empty Split Inboxes" toggle
  - "Split Inbox Library" with presets
- [PUB] Onboarding art also shows Calendar and Newsletters splits.

**List row anatomy [LIVE]**
- One line, in this order:
  1. unread dot
  2. sender (fixed column, ~160 px)
  3. subject
  4. snippet in gray, ellipsized
  5. right-aligned time
- Threads with several participants show "Miles, Laura, Amelia". "Me" stands for you.
- Shared or commented threads show an icon before the subject and an `@Duper` mention highlight chip.
- **Hover:** the time is replaced by ✓ / clock / ⚡ action icons.
- **Selected:** lavender background plus the purple left bar.
- **Grouping:** today has no header; then "Last 7 days" and "Earlier this month".

**Reading pane [LIVE]**
- **Thread header:** the subject in large type. The subtitle is an AI one-line summary, e.g. "Rahul offers a free month of Superhuman Mail to duperhuman" (that's **Auto Summarize**).
- **Header actions, right side:** Share, ✓, clock, ⚡, ▲ ▼ for previous and next.
- **Messages:**
  - Each message is a card with the sender name on the left and the time on the right.
  - Collapsed messages show a one-line preview.
  - Quoted text is collapsed to "…".
- **Instant Reply chips** sit under the last message: "Thanks, Rahul · I'll take a look · Not right now".
- **Comment bar:** a pinned bottom bar reading "@mention anyone and share conversation" (Team Comments).
- **Contact panel:**
  - avatar, email, location, bio
  - "Mail" section listing recent threads with this person
  - social links (LinkedIn, Wellfound, GitHub, Dribbble, Facebook, about.me, X, website)
- The **remote-image notice** wasn't seen. Images are set under Settings → Images:
  - Show all
  - Block known tracking pixels (default)
  - Block all remote images
  - With blocking on, ⌘K → Show Images reveals them.

**Empty states [LIVE]**
- **Inbox Zero:** a full-bleed landscape photo (it rotates daily [PUB]). The list header floats on it, and the bottom-left says "You've hit Inbox Zero! 🔥".
- The first-time version reads "Congratulations! You hit Inbox Zero. / Spend less time in your inbox, and more time on what matters most."
- **Empty folder:** "No conversations found here." plus the hint "Hit J to go down K to go up / to search".

## 3. Interactions and motion

- **j/k:** moves selection one row; the purple bar moves with it.
  - Timing was not measurable without DevTools. It looks instant, under 1 frame [LIVE].
  - [PUB] Superhuman's stated target is every interaction under 100 ms.
- **Mark Done (E) [LIVE]:**
  - The row disappears, the rows below slide up, and the count in the split tab drops.
  - In the tutorial, after three Es: "Nice! Those messages are marked Done".
  - **Auto Advance** controls where focus goes after a triage action. The default is "go down and show the older conversation".
- **Undo:** Z, and toasts include **Undo**.
  - Toast: a bottom-left white card with a blue left accent, text (e.g. "Draft discarded."), a blue "Undo" link and ×. It stays about 5 s [LIVE, estimated].
- **Remind Me (H) [LIVE]:**
  - **Look:** a dark popover with the header "🕐 Remind me" and a monospace input showing `Type "monday" or "2d"`. A dropdown at the right of the input reads **"if no reply ▾"**, so the reminder only fires if nobody replies.
  - **Options and defaults:**
    - tomorrow (THU, 8:00 AM)
    - next week (MON, 8:00 AM)
    - this weekend (SAT, 8:00 AM)
    - someday (`¯\_(ツ)_/¯`)
  - It takes natural-language input.
  - A tooltip on the right explains the feature.
  - Enter confirms, and the onboarding then moves to the next step.
  - **Default Reminder** setting: "in 2 days at 8:00 AM, if no reply".
  - **Auto Reminders** setting has three choices: all messages that need a follow-up, all messages with an external recipient, or none.
  - **Weekdays Only** toggle: "a reminder set for 2 days on Friday will return on Tuesday".
- **Compose (C) [LIVE]:**
  - Opens in the main pane as a centered card titled "New Message". The list is replaced; there's a ← back arrow and ▲ ▼.
  - **Fields:** To (with a ▾ toggle for Cc/Bcc/From and a contact-card icon), then Subject, then the body. The body placeholder is "Tip: Hit ⌘J for AI".
  - **Footer:** text buttons "**Send** · Send later · Remind me · Share draft". The right-side icons are listed under Icons.
  - **Hint bar:** "Hit ⌘ enter to send · ⌘ shift , to discard".
  - Invalid recipients become **red chips**.
  - [PUB] Undo Send has a configurable window.
  - Pop-out compose is available (Shift+C and others).
- **Command palette (Cmd+K) [LIVE]:**
  - A dark centered popover headed "⚡ Superhuman Command". The placeholder is contextual, e.g. "Try: label, folder, trash, or unread".
  - Each row shows an icon, the action name and the shortcut keycaps right-aligned. The keycaps teach the shortcut.
  - The footer suggests "Try: "search" · "remind me" · "sent"".
  - Search is fuzzy and prefix-based, and context-sensitive commands appear only when relevant (for example "Block Sender: <name>").
  - The full list I captured is in §4b.
- **Search (/) [LIVE]:**
  - Opens an input in the list header ("Search").
  - The sidebar hint reads "Search even faster with in:sent, is:unread, and has:attachment. Hit tab to complete · enter to search".
  - **Operators [PUB]:**
    - `from:`, `to:`, `in:`, `is:unread`, `has:attachment`, `older_than:`, `before:`
    - quotes for exact match, `OR`, and `-` to exclude
    - terms are ANDed by default
  - Results replace the list, with term highlighting, inline attachments and message counts. Search state lives in the URL (https://new.superhuman.com/blazingly-fast-search-29119).
- **Shortcuts reference:**
  - ⌘K → Shortcuts opens a **right-panel cheat sheet**, not a modal.
  - It has its own search field and sections: Actions, Navigation, Conversations, Messages, Compose, Format, Folders, Windows, Calendar, Filters. Keys appear as dark keycaps.
  - [PUB] `?` now opens **Ask AI**; it used to show the shortcut overlay.
- **Tooltips:** hovering a button shows a dark tooltip with the shortcut [PUB].
- **Onboarding:** see §6.

## 4. Keyboard map

Sources: the live Shortcuts panel [LIVE] and the official v8 PDF [PUB] (https://download.superhuman.com/Superhuman_Keyboard_Shortcuts.pdf). Context abbreviations: L = list, R = reading pane, C = composer.
- **Two-key sequences:** `g` then a letter. [GUESS] The timeout is about 1 s; I didn't measure it.
- **Superhuman Focus:** arrow keys.

**Actions**

| Key | Action | Context |
|---|---|---|
| ⌘K | Superhuman Command | all |
| / | Search | L, R |
| Z | Undo | L, R |
| ? | Ask AI | L, R |

**Navigation**

| Key | Action | Context |
|---|---|---|
| J / K | Next or previous conversation | L, R |
| N / P | Next or previous message | R |
| Enter | Open | L |
| Esc | Back | all |
| Tab / Shift+Tab | Next or previous Split | L |
| ← | Open Folder Menu | L |
| Space / Shift+Space | Page down / up | L, R |
| ⌘↑ / ⌘↓ | Jump to top / bottom | L |
| Ctrl+1–9 | Switch accounts | all |
| ← → ↑ ↓ | Superhuman Focus | all |
| ` | Escape, when "Backtick as Escape" is on (Advanced setting) | all |

**Conversations**

| Key | Action | Context |
|---|---|---|
| E | Mark Done (archive) | L, R |
| Shift+E | Mark not Done | L, R |
| H | Remind Me (snooze) | L, R |
| S | Flag (Outlook) or Star (Gmail) | L, R |
| V | Move | L, R |
| U | Mark read or unread | L, R |
| — | Summarize | R |
| # | Delete or Trash | L, R |
| ! | Mark as Junk or Spam | L, R |
| [ / ] | Move to Archive (Outlook) or remove label (Gmail), then next or previous | L, R |
| ⌘U | Unsubscribe | L, R |
| ⌘P | Print | R |
| ⇧M | Mute (Gmail) | L, R |
| X | Select conversation | L |
| Shift+J / Shift+K | Add to selection | L |
| Esc | Clear selection | L |
| ⌘A | Select all from here | L |
| ⌘⇧A | Select all | L |
| L | Add or remove label (Gmail) or categorize | L, R |
| Y | Remove label | L, R |
| Shift+Y | Remove all labels | L, R |
| — | Share Conversation; Comment; Comment Emoji Reaction; Delete Comment (Delete key) | R |

**Messages**

| Key | Action | Context |
|---|---|---|
| C | Compose | L, R |
| Enter | Reply all | R |
| R | Reply | R |
| F | Forward | R |
| ⌘O | Open links and attachments | R |
| Tab | Cycle through links and dates | R |
| O | Expand message | R |
| Shift+O | Expand all messages | R |
| — | Expand or collapse header; Show New Messages | R |
| ; | Use snippet inline | C |
| ⌘; | Use snippet | C |

**Compose (in the composer)**

| Key | Action |
|---|---|
| ⌘⇧O | To |
| ⌘⇧C | Cc |
| ⌘⇧B | Bcc |
| ⌘⇧F | From |
| ⌘⇧S | Edit subject |
| ⌘⇧M | Edit message |
| ⌘J | Superhuman AI (Write with AI) |
| ⌘⇧A | Attach |
| ⌘⇧, | Discard draft |
| ⌘⇧I | Instant Intro (move contacts to Bcc) |
| ⌘⇧H | Remind me |
| ⌘⇧L | Send later |
| `:smile` | Insert emoji |
| ⌘Enter | Send |
| ⌘⇧Z | Send instantly (skips the undo delay) |
| ⌘⇧Enter | Send and Mark Done |

**Pop out**

| Key | Action |
|---|---|
| Shift+C | Pop out compose |
| Shift+Enter | Reply all, popped out |
| Shift+R | Reply, popped out |
| Shift+F | Forward, popped out |
| ⌘⇧P | Pop a draft out or in |
| ⌘/ | Pop out a draft and search |
| ⌘D | Toggle focus between the draft and the thread |

**Format (in the composer)**

| Key | Action |
|---|---|
| ⌘B | Bold |
| ⌘I | Italic |
| ⌘U | Underline |
| ⌘K | Hyperlink |
| ⌘O | Color |
| ⌘⇧X | Strikethrough |
| ⌘⇧7 | Numbered list |
| ⌘⇧8 | Bullets |
| ⌘⇧9 | Quote |
| Tab / ⇧Tab | Indent or outdent a list |
| ⌘] / ⌘[ | Increase or decrease indent |
| `-` + space | Bullet list ("Convert Hyphen to Bulleted List" setting) |

**Folders.** Each is `g` then a key.

| Keys | Go to |
|---|---|
| g i | Inbox / Important |
| g o | Other |
| g s | Starred / Flagged |
| g d | Drafts |
| g t | Sent [LIVE: "Sent Items" on Outlook] |
| g e | Done |
| g h | Reminders |
| g m | Muted |
| g ; | Snippets |
| g ! | Spam / Junk Email |
| g # | Trash / Deleted Items |
| g a | All Mail |
| g l | Label / Folder… |

**Windows**

| Key | Action |
|---|---|
| ⌘N | New window |
| ⌘T | New tab |
| ⌘⇧] / ⌘⇧[ | Next or previous tab |
| ⌘1–9 | Switch tabs |
| ⌘W | Close tab |
| ⌘= / ⌘- / ⌘0 | Font size up, down or reset |
| ⌘F | Find within page |
| Ctrl+/ | Copy private link |

**Calendar**

| Key | Action |
|---|---|
| 0 | Open day |
| 2 (or 0 then 0) | Open week [LIVE] |
| T | Today |
| - or P | Previous day or week |
| = or N | Next day or week |
| — | Share availability |
| B | Create event |
| ⇧B | Create empty event |

**Filters**

| Key | Filter |
|---|---|
| ⇧U | Unread |
| ⇧S | Starred |
| ⇧I | Important |
| ⇧R | No Reply |

### 4b. Command palette inventory [LIVE]

These came from scrolling the whole ⌘K list with an empty query and an open thread. The list is context-dependent.

- **Triage:** Mark Done; Remind Me; Flag; Move; Label; Remove from Label; Delete; Mark Junk; Mark Read; Bulk Actions; Get Me To Zero.
- **Messages:** Open Link; Reply All; Reply; Forward; Compose; Search; Filter Unread Conversations.
- **Snippets:** Use Snippet; Create Snippet.
- **Links:** Copy Private Link to Conversation; Copy Private Link to Current Location.
- **Help and learning:** Attend a Live Webinar; Help Center; Guides; Shortcuts; Attend Calendar Webinar; Attend Mobile Webinar.
- **Theme:** Set Theme: Dark; Set Theme: Match macOS; Set Theme Style: Classic.
- **Sharing and feedback:** Save as PDF; Share Conversation; Copy Link to Shared Conversation; Give Feedback on Auto Label; Share Feedback.
- **Calendar:** Share Availability; Open Day; Meet With; Create Booking Page; Create Event; Create Empty Event.
- **Team and referrals:** Add to Team; Copy Team Join Link; Refer <sender> to Superhuman Mail; Refer to Superhuman Mail; Copy Referral Link.
- **Accounts:** Switch Accounts; Next Split Inbox.
- **Settings:** Settings; Reminder Settings; Auto Draft Settings; Personalization; Signature; Calendar Settings; Scheduling Settings; Auto Bcc Settings; Blocked Senders; Auto Advance Settings; Download Settings; Image Settings; Theme Settings; Split Inbox Settings; Edit Profile.
- **Other:** Download Superhuman Mail on Mobile; Block Sender: <addr>; Block Domain: <domain>; Exclude from Auto Bcc; Check for Updates.
- **Billing and account:** Billing Page; Update Payment Method; View Receipts; Privacy Policy.
- **Also documented [PUB]:** Hello (contact support), Show Images, Deactivate/Reactivate Superhuman AI, Ask AI.

## 5. AI features

| Feature | Entry point | Observed UI [LIVE] | Plan [PUB] |
|---|---|---|---|
| **Write with AI** | ⌘J in the composer; the sparkle-pen icon | The body becomes a single-line prompt field with a gradient border, placeholder "Write, find, schedule, or ask anything" and a send orb at the right. A popover shows examples ("Find key insights from last quarter", "Write a message sharing our progress", "Schedule a follow-up with the team…", "Hit Shift+Enter to add a new line"). The onboarding art shows rewrite chips: Shorten, Simplify, Lengthen, Improve writing, Rewrite in my voice. | Starter+ |
| **Ask AI** | `?` or ⌘K → Ask AI | Right-panel chat: "What can I help you with today?", input "Find, write, schedule, or ask anything…", suggestions ("How do I edit my profile?", "How do I add another account?", "Schedule 15 mins for a quick task"), a footer link "Add to the Knowledge Base (Beta)" and the hint "enter to send · esc to close · ⌘⇧J to start a new chat". Handles attachments; 90-day chat history; 5 years of mail indexed (https://help.superhuman.com/hc/en-us/articles/46005676610829-Ask-AI). | Business+ |
| **Auto Summarize** | automatic | A one-line summary under the thread subject | Starter+ |
| **Instant Reply** | automatic; ⚡ on the row | Three short reply chips under the last message | Starter+ |
| **Instant Event** | — | Creates an event from an email [PUB] | Starter+ |
| **Auto Labels** | Settings | Built in: marketing, news, pitch, social. **Auto Label Library:** respond, meeting, signature (documents to sign), login (password resets and OTPs), recruiting, invoice, tax, purchases, shipping. Custom labels via "New Auto Label". | Custom labels with AI: Business |
| **Auto Archive** | Onboarding and settings | A checklist of auto labels to auto-archive. It skips senders you've emailed and custom labels. Shows a banner: "124 emails Auto Archived". | Starter+ |
| **Auto Reminders / Auto Drafts** | Settings → Auto Drafts | **Follow-ups** ("…needs a follow-up"); **Responses** ("Automatically draft a reply when a message requires a response"; "As time passes and facts change, we keep your draft up to date"); "Only draft a reply to people I've emailed before"; "Add teammate on Cc to handle scheduling" | Business+ |
| **Personalization (Beta)** | Settings | Tabs: Category, Greeting & Signoff (Hey / Thanks), Job Title & Company, Writing, Scheduling, Events, About Me, Knowledge Base. Fields: Job title, Company, Company description. | Starter+ |
| **Knowledge Base (Beta)** | Settings | A table with columns Type, Owner, Updated | Business |
| **MCP** | Settings → MCP | "Drive Superhuman Mail from Claude, ChatGPT, or any AI tool"; one-click Codex, Claude and ChatGPT buttons; public URL `https://mcp.mail.superhuman.com/mcp`; browser OAuth | Business |
| **Autocomplete / Autocorrect** | Settings toggles | Autocomplete is on by default | Starter+ |
| **Write with Voice** | mic permission in the plist | Not exercised | — |

- **AI data notice [LIVE, onboarding]:** "we encrypt and store your emails through a trusted third-party vendor. We partner with Anthropic, OpenAI, and Google, who do not retain your data or use it to train models."
- **AI states:** I didn't capture loading, streaming or error states, because I didn't submit any AI prompt (that would cost credits and generate drafts).
- [GUESS] Expect a shimmer placeholder followed by token streaming into the body.

## 6. Screenshots and onboarding flow

**Files in `docs/superhuman-shots/`:**
- important-list
- thread
- composer
- write-with-ai
- remind-me-menu (dark popover)
- remind-me-from-list
- shortcuts-panel
- inbox-zero
- search
- ask-ai
- label-menu
- calendar-week
- settings-sidebar
- settings-reminders
- settings-theme
- settings-mcp
- settings-calendar
- get-me-to-zero
- tutorial-practice-inbox
- welcome-checklist
- onboarding-survey
- onboarding-ai
- onboarding-auto-archive
- onboarding-teammates
- onboarding-read-statuses

All of them are light theme only.

**Onboarding sequence [LIVE].** Every step has a thin purple progress bar at the top and a pink and lavender sky background.
1. **Survey: "Let's talk about email."**
   - "What do you dislike most about email?" Radio options: too much time, disorganized, forget to follow up, team input slow.
   - Then "How do you manage your inbox? (Select all that apply)" with icon chips: Labels, Folders, Stars, Flags, Mark Unread, Trash, Archive, None of the above.
2. **"Tell us a bit about yourself."**
   - Workspace name (placeholder "e.g. Acme Co or Duper's Workspace").
   - Type of work: Founder/CEO, Sales, Design, Product, Engineering, Marketing and more.
   - Role (e.g. Executive) and company size.
   - Fields appear progressively.
3. **"One last question before we begin."** How did you hear about Superhuman Mail? This is a split layout.
4. **"Start saving hours every week."** Three cards (🚀 Take back your inbox, ⚡ Collaborate faster, ⏰ Work effortlessly with AI) and the "Optimize my inbox" button.
5. **"Tailoring your inbox to how you work."**
   - A spinner while it checks recent activity.
   - The status line cycles, e.g. "Identifying your busiest senders".
   - Footer: "Analysis happens only on your device."
6. **"Move faster with Superhuman AI."** Lists Auto Reminders, Auto Drafts (Business), Auto Labels and Ask AI (Business), plus the vendor notice.
7. **"Turn an idea into an email."** Fields for job title, company name and company description, which feed Write with AI.
8. **"Eliminate clutter for good."** Auto Archive checklist.
9. **"Add your teammates."**
   - Recommended contacts with Select All.
   - "You will be billed for each teammate who joins."
   - Buttons: "Do this later" / "Invite & Continue". I clicked Do this later.
10. **"Respond with brilliant timing."**
    - Read Statuses toggle, on by default.
    - Popover art: "Opened 4 times" with a device icon, name and time per open; "Read statuses shared by Laura"; "Rohan is typing…"
11. **"Download Superhuman Mail for Android or iOS."** A QR code and the "Start tutorial" button.
12. **Practice inbox tutorial (simulated data).** A bottom coach strip with "Hit enter to continue" keycaps runs these steps:
    - Welcome
    - "Superhuman Mail helps you and your team move faster"
    - "You're more productive when your inbox is free of clutter: Hit E…" (with three E keycaps)
    - "Nice! Those messages are marked Done"
    - "Hit enter to open the next message"
    - "This message has no actions: Hit E"
    - "Great! Those messages are no longer in your inbox"
    - "Not all messages need your immediate attention: Use Remind Me"
    - Remind Me popover
    - "There's just one more email standing between you and Inbox Zero"
    - "Congratulations! You hit Inbox Zero."
13. **Real inbox.**
    - "Hit enter to set up your inbox".
    - A "Welcome to Superhuman Mail 🚀" modal: "If you ever need anything, hit ⌘K → Hello."
    - Then the Get Started checklist.

**Seeded emails:** "Duper, welcome to Superhuman Mail 🚀" and "Finish your Superhuman Mail setup" ("Plus, get a free month on us!"), both from Rahul Vohra.

## 7. Settings (every pane found) [LIVE]

The settings list opens in the right panel. It is grouped like this:

- **Superhuman AI ✨:**
  - Autocomplete (toggle)
  - Autocorrect
  - Auto Archive
  - Auto Drafts
  - Auto Labels
  - Auto Label Library
  - Knowledge Base (Beta)
  - MCP
  - Personalization (Beta)
  - Reminders
- **Split Inbox:** Split Inbox, Split Inbox Library.
- **Superhuman Mail for Sales:** HubSpot, Pipedrive, Salesforce, Recent Opens.
- **Learn Superhuman Mail:** Guides, Shortcuts, Tutorial, Getting Started Checklist, Attend Live Webinar, Quick Tips.
- **My Account:** Add Accounts, Edit Profile (sign-in gated), Theme, Achievements, Billing.
- **My Team:** Add to Team, Talk to Sales.
- **Calendar:**
  - Calendar Accounts
  - Meeting Links:
    - Zoom on all new events
    - Meet on Google events and Teams on Outlook events
    - none
  - Timezones
  - Scheduling (which calendars AI checks)
  - Notifications
  - Calendar options:
    - Start week on Monday
    - Show weekends
    - Show declined events
    - Show secondary timezone
- **Triage:** Get Me To Zero, Bulk Actions, Hide Empty Split Inboxes.
- **Writing:** Emoji; Signature ("Include signature on replies and forwards", "Include 'Sent via Superhuman'" referral); Convert Hyphen to Bulleted List.
- **Workflow:** Auto Advance, Auto Bcc (CRM BCC address plus exclusions), Downloads (folder), Images, Out of Office Reply, Read Statuses.
- **Advanced:** Backtick as Escape, Send + Mark Done, RSVP + Mark Done, Hide Comment Bar, Show Sender Full Names.
- **Sign Out.**

**Get Me To Zero:**
- "We'll move old email from your Inbox to the Done folder… Most people move email older than 1 week."
- A dropdown, "1 week (most popular)", plus More options.
- Buttons: "Do this later" / "Let's go! 🚀".

**Blocked Senders:** empty state reads "To block a sender, open a message from them, hit ⌘K → Block."

## 8. Calendar, contacts, team, mobile, pricing

- **Calendar [LIVE]:**
  - `2` opens a week grid (Sun–Sat, 5 am–11 pm) with a mini month ("October 2026") and a TODAY button.
  - "Meet with" field: "Enter name or email".
  - Booking Pages.
  - Calendars list.
  - Hint bar: "Hit = for next week · - for previous week · T for today · B to create an event".
  - [PUB] Share Availability inserts open time slots into a draft.
- **Contacts sidebar [LIVE]:** described in §2.
- **Team [LIVE/PUB]:**
  - Shared Conversations, Team Comments with @mentions and emoji reactions, Share Draft, Team Snippets, Shared Read Statuses, and Recent Opens ("See recently opened messages from you by people not on your domain").
  - Teams are up to 25 seats on Starter and Business, unlimited on Enterprise.
- **Mobile [LIVE onboarding art / PUB]:**
  - iOS and Android apps.
  - Bottom tabs: Mail, Calendar, Search, avatar.
  - Split tabs at the bottom ("Important 72 · Calendar 4 · News 10").
  - Inline RSVP buttons (YES / MAYBE / NO).
  - Swipe triage [PUB].
- **Pricing [PUB]** (https://superhuman.com/plans/mail):

| Plan | Annual billing | Monthly billing | Includes |
|---|---|---|---|
| Starter | $25/member/mo | $30 | Email productivity, Superhuman AI, team collaboration, calendar, admin/billing, group coaching |
| Business | $33/member/mo | $40 | Starter plus most advanced AI, Auto Drafts, Ask AI, Mail MCP, Custom Auto Labels with AI, HubSpot and Salesforce, Recent Opens, Smart Send |
| Enterprise | custom | custom | Business plus SSO, advanced security, team analytics, CSM, priority support |

  - The trial is one free month and requires a card [LIVE, from the signup flow].
  - The billing nav shows "Mail · Grammarly · Docs", so Superhuman is now part of the Grammarly/Superhuman suite [PUB].

## 9. Differences to decide: what depends on Superhuman's backend

| Behavior | Can a Gmail/Graph client reproduce it? |
|---|---|
| Instant local search | **Yes.** Use SQLite FTS5 on a local mirror and parse Gmail syntax ourselves. |
| Undo send / Send later | **Yes for undo send** (a client-side delay). **Send later needs a server** or Gmail scheduled send (Gmail API has no scheduled send; Graph supports deferred send via `PidTagDeferredSendTime`). |
| Remind Me with "if no reply" | **Approximately.** It needs a server job that checks for replies and re-inserts the thread with a label. |
| Read statuses / Recent Opens | **Server only.** It needs tracking-pixel injection and a pixel host, and raises privacy concerns. |
| Auto Summarize / Instant Reply / Write with AI / Ask AI | **Yes**, with an LLM (Claude). Ask AI needs a local embedding index. |
| Auto Labels / Auto Archive | **Yes.** Use LLM classification plus Gmail labels or Outlook categories. |
| Auto Drafts | **Yes**, with a background job that writes drafts through the API. |
| Split Inbox | **Yes.** It's a client-side query per split. |
| Calendar sidebar / booking pages | **Calendar: yes** (Google Calendar or Graph). **Booking pages need a hosted page.** Reuse CalendlyIsDead. |
| Team comments / shared conversations / shared drafts | **Server only.** They need our own backend and identity. |
| Push notifications | **Approximately.** Gmail `watch` via Pub/Sub, or Graph subscriptions, through a relay. |
| Contact enrichment (bio, social links) | **Approximately.** It needs a third-party enrichment API. |
| MCP server | **Yes.** Expose a local or hosted MCP over our store. |
| Inbox Zero photos, tutorial, achievements | **Yes.** These are pure client work, with original assets only. |

## 10. Gaps (need follow-up; items 1, 2, 4 and 5 are now resolved in §12)

1. **DevTools:** these weren't opened, so there are no computed styles, exact fonts or animation timings. The fix is ⌘⌥I, or View → Toggle Foreground Developer Tools, on the Mini. A synthetic keystroke never opened them, and macOS denied menu clicks through System Events ("Access not allowed"). Exact typefaces, easing curves and durations are still estimates.
2. **Dark theme:** not captured. Switching it would change a setting; it's harmless, but I left it for Tommy to OK.
3. **Thread with 3+ messages:** the new account has no real conversations, so I only have the practice-inbox and Rahul threads.
4. **AI states:** loading, streaming and error states weren't captured because I submitted no prompts.
5. **Not visited:** Billing, Achievements, Out of Office, Notifications, Timezones, HubSpot, Pipedrive, Salesforce and Snippets panes weren't opened individually. Typed palette queries into those panes misfired (§11).
6. **Mobile apps:** not inspected.

## 11. Incident during capture (for transparency)

- **What happened:** a scripted run typed settings names into the palette after it had closed. The keystrokes landed as single-key shortcuts in the inbox.
- **Effects:**
  - Two stray drafts were created: a reply to the Microsoft security notice and a draft to hello@superhuman.com. **Both were discarded.**
  - The Important count went from 5 to 3. Some messages were probably marked Done or moved, and they are recoverable from Done.
  - A "Create Label" dialog appeared and may have created one junk label.
  - A comment may have been typed into the comment bar. It would only be visible to people the thread is shared with, and it isn't shared with anyone.
- **Checks:**
  - **Sent Items is empty.**
  - Drafts is empty after the cleanup.
  - No settings were saved: the panes' Save buttons were not clicked.

---

## 12. Phase A addendum (2026-10-14 evening): DevTools, dark theme, AI states, remaining panes

Where this section conflicts with the estimates in §1 and §3, **this section wins.**

### 12.1 DevTools measurements [LIVE, computed styles]

**How I got in**
- ⌘⌥I opened "Developer Tools - https://mail.superhuman.com/<account>".
- I ran a read-only probe script in the Console (`getComputedStyle`, stylesheet rules and `document.fonts`).
- The raw JSON is saved as `docs/superhuman-shots/probe-inbox.json`.

**Fonts.** All of these are proprietary. DuperHuman uses **DM Sans**, plus DM Mono for the mono roles.
- **UI:** `SuperMailSans` (400 and 700 are loaded; there is also a variable "Super Sans VF").
- **Monospace** (Remind Me and palette inputs): `Superhuman Operator Mono Book` / `Super Sans Mono VF`.
- **Serif:** `SuperMailSerif` / `Super Serif VF`, used for message bodies when the user picks a serif font.
- **Legacy email font:** `Superhuman Adelle` (it renders the avatar initials, 18 px / 700).
- **Shared design system:** the Grammarly "origin" tokens (`--origin-*`, about 1,300 variables) are loaded. Their stacks are Inter for sans, Matter for secondary headings, Super Serif VF for serif and Super Sans Mono VF for mono. This confirms the app shares Grammarly's design system.

**Text styles (computed)**

| Element (class) | Font | Size / line-height | Weight | Color |
|---|---|---|---|---|
| `ThreadListItem-snippet` | SuperMailSans | 12/16 | 400 | `#73716D` |
| `ThreadListItem-datetime` | SuperMailSans | 12/16, letter-spacing 0.204px | 400 | `#73716D` |
| Split tab `Folder-name-label` (active) | SuperMailSans | 16/24 | 400 | `#141413` |
| Split tab (inactive) and `Folder-bullet` "•" | SuperMailSans | 16/24 | 400 | `#797672` |
| `Folder-count` | SuperMailSans | 12/24 | 400 | `#73716D` (active) / `#797672` |
| `ThreadList-add-split-label` "Add Split" | SuperMailSans | 16/24 | 400 | `#8D8A86` |
| Keycap `Key-inner` | SuperMailSans | 12/12 | 700 | `#FFFFFF` on dark; "then" in `#73716D` |
| Hint bar ("Hit E to Mark Done…") | SuperMailSans | 12/24 | 400 | `#141413` |
| Ask AI header | SuperMailSans | 16/24 | 400 | — |
| Ask AI empty title | SuperMailSans | 16/24 | 600 | — |
| Ask AI suggestion chips | SuperMailSans | 12/16, 28 px tall, bg `#F7F5FF`, radius 2, padding 7/8/5 | — | — |
| Checklist title / item | SuperMailSans | 14/16 | 700 / 400 | — |
| "Beta" tag | SuperMailSans | 8 px | — | `#3F256F` |
| Base text token | — | — | — | `--origin-color-text-base-default` `rgb(25,25,25)` |

**Box metrics at a 1920×1080 viewport**

| Element (class) | Metrics |
|---|---|
| `LeftRail` | 40 px wide, `padding-top: 36px`. The app switcher is a 30×60 pill, bg `#F2F0EB`, radius 15. |
| `ThreadListView` | `padding: 0 6px`. It has an 8 px header gradient with `box-shadow: rgba(0,0,0,.05) 0 -1px 0 0`. |
| `ThreadListItem` | **36 px tall**, `padding: 10px 30px 10px 63px`, radius 4 |
| `ThreadListHighlight` (selection) | 36 px, bg `#F7F5FF`, radius 4 |
| `RightPane` | **423 px**, bg `#FCFAF7`, `border-left: 1px solid #DEDBD5` |
| `LabelSwitcherHighlight` | the label and folder menu's selected row: 48 px, `#F7F5FF` |

**Motion tokens**

| What | Timing | Selector or token |
|---|---|---|
| Modal | fade/scale **200 ms ease-in-out** | `--origin-animation-duration: .2s` |
| Accordion and multiselect | **300 ms `cubic-bezier(0.87,0,0.13,1)`** | — |
| Overlay | `opacity 200ms` | `.Overlay-transition-*` |
| Buttons | color, background and box-shadow **150 ms** | — |
| Switch | 150 ms `cubic-bezier(0.3,0,0.6,1)` | — |
| Checkbox | opacity 64 ms linear | — |
| Keycap highlight | background and color 300 ms | `.Key-shortcutsPane` |
| Tutorial keycap pulse | `Key-breathe` 0.4 s alternate infinite | — |
| Message bar (hint bar) | background 250 ms | — |
| Done checkmark | `drawCheckmark` / `revealCheckmark` 0.5 s ease | — |
| Skeletons | fade-in-down 300 ms; shimmer 2 s; placeholder lines 4 s linear | — |
| Branded AI loader | gradient pulse 1.98 s | — |
| Scrollbar | thumb fades after 0.5 s delay over 0.2 s | simplebar |
| Calendar month paging | slide 0.3 s | react-day-picker `rdp-*` |
| Error | `shake` keyframe, translateX 0→10→0 | — |

**Libraries seen** [LIVE]: simplebar (scrollbars), react-day-picker (`rdp-`), Headway (changelog badge `HW_badge`), and Grammarly's origin design system.

### 12.2 Dark theme [LIVE]

- The original theme was **Light + "Superhuman" style**. I switched to Dark to capture it and restored Light afterwards, which I checked with a screenshot.
- Dark colors were sampled from JPEG screenshots and are accurate to about ±3:

| Token | Hex |
|---|---|
| list / rail bg | `#282828` |
| right pane | `#1F1E1C` |
| card (checklist) | `#383735` |
| selected row | `#484443` (warm gray, no lavender) |
| selected edge | `#C4ACEA` (light purple) |
| primary text | `#F1F1F1` |
| hint bar | `#444875` (indigo) |

- **Shots:** `superhuman-{important-list, thread, composer, command-palette, remind-me-menu, search, calendar-week, snippets, settings-theme}-dark.png`.

### 12.3 AI states [LIVE]

**Ask AI (`?`)**
- In the full-screen layout it opens as a **left panel** about 220 px wide, pushing the list right. The input is pinned at the bottom: "Find, write, schedule, or ask anything…"
- The header has three icons: new chat, history and pop-out.
- **States:**
  1. The user bubble shows right-aligned in gray.
  2. "**Connecting the dots.**" appears as a loading line with animated dots.
  3. Collapsible "**Done thinking**" step rows appear, one per tool step. The first explained "Let me search through your recent emails…".
  4. The answer is markdown with bold headings, bullets and **numbered citation chips** (1, 2, 4).
  5. A closing question follows, then a "**Sources**" footer with favicons.
- It took about 12 s for "Summarize what is in my inbox".
- Shots: `ask-ai-loading-dark`, `ask-ai-done-dark`.

**Write with AI (⌘J in the composer)**
- Loading is the body placeholder "**Brewing.**" (animated dots). The **subject and body then appear at once**, in about 1–1.5 s, with no visible token streaming.
- The prompt "a short note thanking the team…" produced the subject "Thank you - great work on the launch! 🎉" and a 3-paragraph body signed with the user's first name.
- The done state has an inline toolbar under the body: "Describe how to edit the text" input, **Retry**, and the chips **Improve writing · Shorten · Lengthen · Simplify · Rewrite in my voice**.
- Both test drafts were discarded and **none were sent**.

**Error state:** not seen.

### 12.4 Remaining panes [LIVE]

**Achievements**
- Three tracks:
  - **Inbox Zero** in DAYS ("Hit Inbox Zero once to reach the next level")
  - **Marked Done** in CONVERSATIONS ("Mark 48 conversations done…"; the current level was 2)
  - **Sent Messages** in MESSAGES ("Send 1 message…")
- There is a "Share your achievements!" button with a LinkedIn icon.

**Out of Office Reply** (left disabled; I checked the toggle is off)
- "Enable Out of Office Reply" toggle.
- First day / Last day date-time pickers (they default to today 9:00 AM → tomorrow 9:00 AM).
- "Send automatic replies to people at outlook.com" and "Only send replies to people in my contacts" checkboxes.
- Cancel and Save buttons.

**Notifications**
- Email notifications: "If Important • Other is on, notify for Important only".
- Calendar notifications: "Notify me: 2 mins before events ▾".

**Timezones** opens the Calendar pane, which has the "Show secondary timezone" toggle.

**HubSpot, Pipedrive, Salesforce**
- Each is a one-pane card: "Get <CRM> data at your fingertips to supercharge your workflow. Sign in with <CRM> to see <CRM> information in the sidebar."
- An OAuth button follows. I didn't connect any of them.

**Emoji** shows "Choose a default skin tone for your emoji. To use an emoji, just type : then the emoji's name!" plus a skin-tone row.

**Accounts** shows the account list and "Sign in with your email provider to add an account."

**Recent Opens** shows "Show a feed in your sidebar that shows who recently opened your messages." (a toggle; Business plan)

**Billing** opens **in the default browser** at `superhuman.com/mail/admin/billing?email=…&provider=microsoft`, behind a separate admin sign-in ("Please sign in to access your team's account" with Google or Microsoft). I didn't sign in, so the plan and card details weren't captured.

**Snippets (g ;)**
- A table with columns Sends · Author · Opened · Replied. It has two sections: **Private Snippets** (with "New Private Snippet") and **Team Snippets** ("Want to share your snippet workflow? Add to Team").
- Seeded snippets:
  - Call follow-up
  - Company description
  - Zoom link
  - Schedule ("Thanks {first_name}! Adding Matti on CC…")
  - Decline
  - Calendly
- Variables use `{first_name}` syntax.
- Hint: "Hit J to go down · K to go up · C to create a Snippet".

### 12.5 Cleanup from the §11 incident

- **Done:** both messages marked Done by the stray keystrokes were restored to the Inbox with Shift+E. Important went back to 5 and Done is empty.
- **Junk label:** the label search for "Libr" found no existing label, so **none was created**. Nothing needed deleting.
- **Deleted Items:** empty.
- **Junk Email:** one Rahul Vohra marketing email ("You're almost there…"). It most likely arrived there through Outlook filtering; I left it in place.

### 12.6 Still open

- **Real 3+ message threads:** I can read the bot inbox but can't send from it. The parent needs to send the test messages (see the report).
- **Write with AI error state:** not seen.
- **Billing details:** behind the admin sign-in.
- **Mobile apps:** not inspected.

> Reference screenshots of the original app used during research are not included in this repository (third-party assets). Image links in this spec that point at `docs/superhuman-shots/` are intentionally absent.
