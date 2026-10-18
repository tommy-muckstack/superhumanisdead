# Analytics (PostHog)

One PostHog project (US cloud, project **666931**) collects the hub and every IsDead sub-app. The contract is the hub's
`yourappisdead/ANALYTICS.md`; this file is how the SuperhumanIsDead **website** (`web/`) follows it.

The Electron desktop app (`src/`) has no analytics and sends nothing.

## Setup
- `web/analytics.ts` lazy-loads `posthog-js` (pinned `1.438.11`). Every page calls `startAnalytics()`: home and pricing
  through `web/session.ts`, login through `web/login/login.ts`.
- Token: `NEXT_PUBLIC_POSTHOG_KEY`, already set on the Vercel project and exposed through `envPrefix` in `web/vite.config.ts`.
  If it's missing, the build falls back to the same publishable token. The UI host is `NEXT_PUBLIC_POSTHOG_HOST`.
- Requests go through this site's own origin: `vercel.json` rewrites `/superhumanisdead/ingest/static/*` to
  `us-assets.i.posthog.com` and `/superhumanisdead/ingest/*` to `us.i.posthog.com` (before the catch-all rewrite).
- `$pageview` is captured once per page load. Autocapture, session replay, heatmaps and performance capture are off.
- Analytics is off when the browser sends Do Not Track, and on `localhost` / `127.0.0.1` unless
  `localStorage.isdead_ph_debug = "1"` (verbose logs, and automated browsers are accepted, for local verification only).

## Privacy scrub
`scrub` in `web/analytics.ts` runs as `before_send` on every event: `$current_url`, `$referrer`, `$initial_current_url`,
`$initial_referrer`, `$prev_pageview_pathname`, `$pathname`, `$initial_pathname`, `$session_entry_url` and `$session_entry_pathname` (also inside `$set` / `$set_once`) keep only origin + path,
with no query string or hash (so `?next=` and `?mode=` never leave the browser), and the page `title` property is deleted.

## Super properties (registered on every event)
| property | value | meaning |
| --- | --- | --- |
| `product` | `superhumanisdead` | the one property to filter by |
| `surface` | `landing` | the website is all marketing + sign-in (`/app` shows the home page); the product is the desktop app |
| `platform` | `web` | |
| `env` | `production` \| `development` | |

At boot the client unregisters other IsDead apps' leftover keys (`app`, `app_family`, `base_path`, `suite_id`, `app_id`,
`schema_version`, `source`, `site_id`, `environment`, `account_type`) from the shared yourappisdead.com cookie, then
registers its own. `resetIdentity()` (sign-out) re-registers them.

## Identity
Signed-in users are identified by Firebase uid (`account_type: "firebase"`): at sign-in and whenever `session.ts` sees a
signed-in user. Visitors who are not signed in are never identified.

## Events
Kinds and enums only. Emails, text and URLs are never sent.

| event | properties | fires from |
| --- | --- | --- |
| `landing_cta_clicked` | `target` (`signup`, `login`, `pricing`, `github`, `contact`), `location` (`nav`, `footer`, `banner`, `page`) | `analytics.ts`, any matching link |
| `app_signed_up` | `method` (`password`, `google`) | `login/login.ts`, sent before the redirect |
| `app_signed_in` | `method` (`password`, `google`) | same; a returning visitor who is already signed in sends nothing |
| `app_signed_out` | | `session.ts` account menu |

Adding an event: add it to `EVENTS` in `web/analytics.ts`, add a row here, and add it to the hub's `ANALYTICS.md`.
