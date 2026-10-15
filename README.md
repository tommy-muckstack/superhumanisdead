# SuperhumanIsDead

A keyboard-first Gmail client with a built-in AI assistant. Runs on your Mac, talks to
Gmail and Claude with your own keys, and has no server of its own.

It is a from-scratch recreation of the Superhuman experience: split inbox (Important /
Other), `j` `k` `e` `h` triage, snooze, a Cmd+K command palette, undo toasts, and
"write with AI" drafts. The whole thing is a few thousand lines of TypeScript.

## Run it

Prerequisites: macOS, Node 22 (`nvm use` reads `.nvmrc`), npm.

```bash
git clone <this repo> && cd SuperhumanIsDead
./scripts/setup.sh        # installs dependencies, runs tests, builds
npm run dev               # launches the app with hot reload
```

On first launch you can press **Try the sample inbox** to see the whole UI with fake
data. To use your real mail you need two keys, both entered in the app's setup screen
and stored encrypted on your Mac.

### 1. Google OAuth client (about two minutes)

Gmail access needs an OAuth client that belongs to you. Google does not let apps share one.

1. Go to https://console.cloud.google.com and create a project (any name).
2. **APIs & Services → Library → Gmail API → Enable.**
3. **OAuth consent screen:** User type External. Fill the app name and your email. Under
   Scopes add `https://www.googleapis.com/auth/gmail.modify`. Under Test users add your
   own Gmail address. You do not need to publish or verify the app for personal use.
4. **Credentials → Create credentials → OAuth client ID → Desktop app.** Copy the client
   ID and client secret into SuperhumanIsDead's setup screen.
5. Click **Save and sign in with Google**. Your browser opens, you approve, and the app
   receives the token on `127.0.0.1`. Google shows an "unverified app" warning because
   this is your own test app; click Continue.

### 2. Anthropic API key (optional)

Summaries, AI drafts and AI inbox sorting use Claude. Create a key at
https://console.anthropic.com and paste it into the setup screen. Without it everything
else still works.

## Keyboard

| Key | Action |
| --- | --- |
| `j` / `k` | Next / previous conversation |
| `e` | Mark done (archive). In Done, moves back to inbox |
| `h` | Snooze (1–5 picks a preset, or choose a time) |
| `r` / `a` / `f` | Reply / reply all / forward |
| `c` | Compose |
| `s` / `u` / `x` | Star / unread / select |
| `z` | Undo the last action |
| `⌘K` | Command palette |
| `/` | Search (Gmail search syntax) |
| `Tab` / `⇧Tab` | Next / previous split |
| `g i` `g o` `g s` `g h` `g t` `g d` `g e` | Go to Important, Other, Starred, Snoozed, Sent, Drafts, Done |
| `⌘J` | AI: summarize the conversation (in the composer: write the draft) |
| `⌘⇧R` | AI: draft a reply |
| `⌘↵` | Send |
| `?` | All shortcuts |

## How it works

```
src/main      Electron main process: OAuth loopback flow, encrypted store (safeStorage),
              Gmail REST proxy with token refresh, Claude proxy (streaming), snooze scheduler
src/preload   The window.duper bridge (contextIsolation + sandbox on)
src/shared    Pure modules: MIME builder, Gmail parser, split rules, key bindings. Unit tested.
src/renderer  React UI: thread list, reading pane, composer, palette, overlays, demo inbox
```

- **Splits** use Gmail's own categories: Important is the inbox minus Promotions, Social,
  Updates and Forums. "Sort this list with AI" (in the palette) reclassifies the loaded
  page with Claude and remembers the moves locally.
- **Snooze** is not a Gmail feature. The app removes the thread from the inbox and a
  scheduler in the main process puts it back, unread, when the time comes. The app has to
  be running for that to happen.
- **Mail bodies** render in a sandboxed iframe with a strict CSP. Remote images are blocked.
  Links open in your system browser.
- **Privacy.** Tokens and keys are encrypted with the macOS keychain via Electron's
  `safeStorage` and never leave the machine. Mail content goes to Google and, only when
  you invoke an AI action, to Anthropic.

## Build a Mac app

```bash
npm run dist:mac     # produces dist/SuperhumanIsDead-<version>.dmg (unsigned unless you add an identity)
```

Set `CSC_NAME` or `CSC_LINK`/`CSC_KEY_PASSWORD` for electron-builder to sign and notarize.

## Tests

```bash
npm test             # vitest over src/shared
npm run typecheck
```

## Matching Superhuman

`docs/SUPERHUMAN_SPEC_PROMPT.md` is a prompt for an agent with a Superhuman account to
produce a measured spec (tokens, layout, motion, keyboard map). The resulting
`docs/SUPERHUMAN_SPEC.md` is the acceptance checklist; `src/renderer/src/styles.css`
holds every token in one place so the match is a matter of editing values.

## License

MIT

## Website (yourappisdead.com/superhumanisdead)

`web/` holds the single marketing page and `/login` (Firebase project `yourappisdead`,
email/password + Google). Copy `web/.env.example` to `web/.env` with the web app config, then:

```
npm run dev:web     # local preview
npm run build:web   # static files in out/web, served under /superhumanisdead/
```

Design tokens and the font (Inter, OFL, closest open match to Superhuman's sans) come from
the shared IsDead design system; refresh with `npm run sync:design`.

## Keyboard map and features

The full Superhuman keyboard map lives in `src/shared/keys.ts` (⌘K → Keyboard shortcuts shows it).
Highlights: `E` done, `⇧E` not done, `H` remind me (natural language, "only if nobody replies"),
`#` trash, `!` spam, `?` Ask AI, `0` calendar (`-` `T` `=` to move days), `g ;` snippets,
`;name` inline snippets and `⌘;` picker in the composer, `⌘⇧L` send later, `⌘⇧H` remind if no reply,
`⌘⇧Z` send instantly, `⌘⇧↵` send and mark done. Undo send uses the delay set in Settings.
Calendar needs the `calendar.readonly` scope: sign out and back in after upgrading.
