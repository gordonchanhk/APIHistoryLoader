# Turning a Pile of API Logs into Insight: Building the Local REST API Explorer

*A build journal, reconstructed from the git history of this project (2026-05-27 → 2026-07-21).*

## The itch

Once upon a time, Gordon had a mountain of raw PayPal REST API call
history — captured order creations, authorizations, captures, refunds,
disputes — and no easy way to *see* what was happening inside it. The
raw JSON exports were complete, but completeness isn't the same as
insight. Somewhere in there were answers to real questions: *Why are
captures failing? Which payment methods are dropping off? What do our
disputes actually cost us?* But finding those answers meant grepping
through walls of nested JSON by hand.

So Gordon started building a tool to ask the data directly — a small,
local, single-page web app (`server.js` + `public/index.html`) that
you point at your exported `.txt`/`.json` API logs and get back an
interactive table, detail views, and a growing set of built-in
analyses.

## Chapter 1 — Just get the data on screen (May 27–28)

The very first commit (`Init commit`) was already a real app: 793 lines
of `index.html` doing the basics — load a file, render a searchable
table of API calls. Within a day, Gordon was already reaching for
*more*: a bookmarklet (`with Bookmark JS`) to pull data straight out of
a browser session, an "Endload feature," and then a cleanup pass to
stop committing the generated bookmarklet file and instead build it
via `npm run bm`.

By the second day the shape of the tool's philosophy was already
clear: raw logs aren't enough, you need **derived views** — an
"exclude path" filter to cut noise, and a "count analysis" to see
which endpoints were actually being hit and how often.

## Chapter 2 — The hard part: Capture / Drop-off analysis (late May – early June)

This is where the story gets interesting, and where most of the
struggle lived. `Enhanced with Capture / Drop-off analysis` (May 28)
introduced the idea that would become the app's centerpiece: group raw
API calls into **orders**, follow each order through its lifecycle
(create → authorize/capture → completed/declined), and summarize
outcomes by payment source.

That idea turned out to be much harder to get *correct* than to get
*working*. The commit trail tells the story of an idea being refined
under pressure from real, messy data:

- `Fix unhandle logic for Capture Analysis` (May 29)
- `Update fixes` (Jun 1)
- `Bug fix for Capture analysis logic, change prompt logic for LoadMore
  APIHistory plugin` (Jun 2)
- `Fix the logic for capture analysis and drop-off` (Jun 2, same day —
  the first fix didn't fully hold)
- `Update Capture/Drop-off analysis` (Jun 9) — a near-total rewrite,
  531 lines removed and 531 replaced
- `Add ACDC error - processor response code` (Jun 16) — realizing that
  "declined" wasn't one thing; card/wallet declines carry a *processor
  response code* that needs its own decoding and labeling

Why was this the hard part? Because "what counts as declined vs.
error vs. pending" isn't a clean binary in PayPal's API — it hides in
different fields depending on payment source (`paypal` vs `card` vs
`card (vaulted)` vs `google_pay`/`apple_pay`), HTTP status, and nested
`details[0].issue` vs. processor response codes. Every "fix" commit is
a sign that another edge case surfaced once real-world data hit the
logic — a classic case of a feature whose *requirements* only fully
reveal themselves once you're staring at production-shaped data.

## Chapter 3 — Scaling to real data volumes (June 18)

Once the analysis logic was trustworthy, the next wall was simply
*size*. `Support multi file load by sequence to avoid memory boost`
reworked file loading so that huge exports — split into
`partNofM` files, sometimes 100+ MB each — could be loaded one at a
time with a progress indicator instead of blowing up the browser's
memory. This is the unglamorous but essential work that makes a tool
usable on *real* datasets instead of toy ones.

## Chapter 4 — From "what happened" to "who it happened to" (June 25 – July 20)

With the transactional core solid, the app's scope widened from *"is
this payment succeeding?"* to *"who are our customers and what do
disputes cost us?"*:

- `Add Payer Info & Dispute analyses, header overview, timestamped
  exports` (Jun 25) — the single biggest commit in the project's life
  (600 lines), adding payer demographics and dispute analysis in one
  push
- `Fix header info line-break` (Jul 7) — a small polish fix
- `Added Demographics section` (Jul 20) — 314 new lines breaking payer
  info down further
- `Add Dispute Calendar View` (Jul 20) — 423 lines, visualizing
  disputes on a calendar instead of just a table
- `Enhance Dispute Calendar with dispute amount lump sum` (Jul 20) — a
  same-day refinement once the calendar was in front of real eyes,
  adding lump-sum dispute amounts per day

Three feature commits landing on the same day (Jul 20) shows a
pattern that recurs throughout this project: ship the view, look at
it, immediately see what's missing, and refine it the same session
rather than letting a rough edge linger.

## Chapter 5 — Closing the loop on Capture Analysis (July 21, today)

Which brings the story to today. The Capture Analysis table had grown
into a genuinely useful summary: per payment-source rows (paypal,
card, card (vaulted), google_pay, apple_pay, ...) each with
Completed/Pending/Declined/Error counts, plus a breakdown of *why*
things were declined, by reason.

But it had one gap: the reason breakdown at the bottom pooled *every*
payment source together. If `card (vaulted)` had 186 declines and
`google_pay` had 19, the reason table just showed "205 declined by
issuer/risk" with no way to tell which reasons belonged to which
payment method — exactly the kind of blind spot that undermines the
whole point of the tool.

Gordon's ask was precise: *click the Declined cell for a payment
source, and the reason table below filters to just that source; allow
multiple sources to be toggled on at once.*

The fix required threading a payment-source dimension through data
that had never carried one. `classifyFail()`, the function that turns
a raw capture/authorize row into a decline reason, only ever saw the
row — never which payment source it belonged to. So the change was
two-layered:

1. **Data**: give each reason bucket a `bySrc` breakdown (count +
   records per payment source), computed once when the modal opens.
2. **UI**: turn each Declined cell into a toggle (not just a
   drill-through link) that adds/removes its payment source from a
   selection set, re-rendering just the reason table — highlighted in
   red when active, with a "Filtered to payment source(s): ... (clear
   filter)" note, and full multi-select support.

The one wrinkle: the Declined cell used to *also* open a
drill-through window of raw records on click. That behavior had to be
consciously traded away in favor of the new toggle — the reason table
underneath, filtered, now serves that drill-down purpose better,
scoped to a specific reason *and* a specific payment source at once.

Before calling it done, the change was verified the way this project
seems to value: not just "the code looks right," but actually driving
a headless browser against the real app with one of Gordon's own
production-shaped sample files (263k+ records), clicking through
single-select, multi-select, deselect, and clear-filter, and checking
for console errors — the same instinct visible throughout the git
history of shipping something, then looking hard at what it actually
does before moving on.

## The throughline

Looking back at ~24 commits over eight weeks, the pattern is
consistent: this app grows by **use, not by upfront design**. Nearly
every feature (Capture Analysis, multi-file loading, Dispute Calendar,
Demographics, and now the payment-source filter) followed the same
loop:

1. Ship a first version that handles the common case.
2. Point it at real data.
3. Discover the case that breaks it, or the view that's still not
   quite legible.
4. Fix it — often same-day, often more than once.

The hardest problems weren't the ones that needed clever code; they
were the ones where the *domain* (PayPal's payment lifecycle, decline
semantics, dispute data) turned out to be messier than the first
mental model assumed. Every "bug fix" commit in this history is really
a small correction to that mental model.

---

*This post was reconstructed from `git log` and the day's working
session — it captures the commit-level story, not the private
back-and-forth that produced each commit.*
