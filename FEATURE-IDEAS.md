# Vault — Feature Ideas

Forward-looking list of new additions and features for Vault. Grouped by area,
opinionated, with the top picks called out at the bottom.

Items marked **✓ Shipped** are already implemented and live in `main`.

---

## Value tracking & insights

These earn the gold accent in the palette. The collection has prices — turn it
into a portfolio.

- **Portfolio screen** — total collection value over time as a sparkline,
  24h / 7d / 30d / all delta, top movers, biggest losers. Pokémon TCG is
  functioning as an asset class for a lot of collectors; no one serves them a
  clean Robinhood-style ledger.
- **Per-card price alerts** — "ping me when Charizard 4/102 PSA 9 crosses $X"
  with push notifications. Cheap to build on top of existing pricing data,
  very sticky.
- **Cost basis & realized P/L** — log what you paid; show unrealized vs
  realized gains when items leave the collection. Tax-season feature.
  **✓ Shipped**
- **Set completion progress** — % of cards owned per set, missing-cards
  drill-down. Drives engagement and wishlist additions. **✓ Shipped**

## Scanner & input

Friction here is the biggest blocker for new users with a 500-card backlog.

- **Bulk scan mode** — camera stays open, taps add card after card without
  leaving the viewfinder. Biggest single unlock for onboarding.
- **Condition grading hint from photo** — call out visible whitening,
  scratches, centering off-axis. Even rough heuristics beat nothing.
- **Cardback / lot recognition** — point at a stack or binder page, detect
  multiple cards at once.

## Social

Friends already exist; extend the relationship so it can actually *do*
something.

- **Friend collection diff** — "you both own 12 cards; you have 8 they don't;
  they have 5 you don't." A pure ownership comparison. **✓ Shipped**
- ~~**Trade proposals**~~ — **Removed.** Cards are held physically; the app only
  shows who owns what, so there is no in-app trading.
- **Activity feed** — friends added cards, hit set milestones, published a
  binder. Light, optional. **✓ Shipped**
- **Public showcase profile** — opt-in shareable link (`vault.app/u/devin`)
  showing chosen binders. Acquisition loop. **✓ Shipped**

## Market & commerce

- **Listings from collection** — one tap "list for sale" from any owned card,
  with suggested price from comp data.
- **Comparable sales graph on card detail** — last 30 / 90 days of comps with
  grade filter (raw / PSA 9 / PSA 10). Pricing today is a single number;
  collectors want the distribution.
- **Watchlist alerts on Market tab** — saved searches that ping when new
  matching cards appear.

## Collection management

- **Bulk actions** — multi-select in collection view → move to binder, edit
  condition, mark for sale, delete. Mandatory once a collection passes ~200
  cards.
- **Smart binders** — auto-populating rules ("every Charizard," "every card
  from Base Set in NM"). Binders today are manual; smart binders are durable.
  **✓ Shipped**
- **CSV / TCGplayer / Collectr import & export** — the migration moat. Once a
  2,000-card collection is in Vault, churn drops near zero.
- **Grading queue tracker** — log cards sent to PSA / CGC / BGS, stage
  (received, research, grading, shipped back), expected value lift on
  completion. Niche but very engaged users. **✓ Shipped**

## Polish / quality of life

- **Haptics on key interactions** — adding to collection, hitting a
  milestone, price alert firing. Cheap, raises perceived quality a tier.
- **Widget for iOS lock screen / home screen** — total collection value +
  24h delta. Free brand surface every time the phone unlocks.
- **Apple Watch glance** — just the number. Same logic.
- **Dark / amber theme variant** — keep dark-only but offer a warmer "vault"
  palette swap (`#C9A227` aged brass instead of pure gold).

---

## Ruthless top 5

If only five can ship, in this order:

1. **Portfolio screen** with sparkline + top movers
2. **Bulk scan mode**
3. **Price alerts**
4. **Friend collection diff** — ownership comparison
5. **CSV import / export**

These compound: portfolio gives a reason to keep checking the app; bulk scan
and import populate it fast; alerts pull users back; and the friend diff is
the only feature here that doesn't depend on Vault for distribution to grow.
