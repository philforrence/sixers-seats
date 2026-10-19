# Sixers Seats

Phil & Andrew's 76ers 2026-27 season ticket manager. It covers who's going, what's for sale, what the seats are worth, and who owes whom.

- **Static site on GitHub Pages.** No server, no build step.
- **Your Google Sheet is the database.** The app signs in with Google and reads/writes the sheet directly with your own access, so the sheet's sharing settings are the real lock. Only `philforrence@gmail.com` and `mozartpc27@gmail.com` get past the sign-in screen.
- **Live prices** come from ESPN's schedule feed, which carries Vivid Seats' get-in price and inventory for every game. A GitHub Action snapshots them twice a day into `data/prices.json` to build price history.

## Views

| View | What's there |
|---|---|
| **Home** | Next game with a countdown, who's going and its value. Counts for going / for sale / sold. A **Needs attention** list: list soon, transfer to buyer, empty seat, payout pending, undecided games, resale-cap warnings. Resale allowance meter and recent activity. |
| **Games** | List or month calendar, with filters (upcoming, mine, going, for sale, sold, Mon/Wed, doubleheaders…). Each row shows plan, seat holders, both partners' interest, get-in price and your estimate. You can export `.ics` calendars (all games, or just yours). There's an **Add a game** button for the NBA Cup date in December. |
| **Game drawer** | Plan (undecided / going / sell). Interest toggles. Seat assignments with guest names. Listing (platform, price, date) and sale (price, qty, payout after fees, buyer, transferred, paid). Market KPIs and a price history chart. A **Quick / Fair / Stretch** price table with net payout per platform. Timing tips, links to every marketplace, similar games, notes. |
| **Market** | Every upcoming game ranked by value, with the 7-day trend and the "left market" demand signal. Your logged sales vs. the get-in price at the time. The seat multiplier explained. |
| **Split** | Ticket value each partner has used (guests count toward the partner who brought them). Season cost, net sale proceeds, pending payouts, and a settle-up line ("Andrew is owed $X"). |
| **Settings** | Section, row, seats, season cost, seat multiplier override, resale/exchange caps, seller fee % per platform. |

### How the price estimate works
`your seat value ≈ arena get-in price × seat multiplier`

- **Multiplier, once you've sold 2+ games:** learned from what you actually sold for vs. the get-in price at that moment.
- **Before that:** calibrated from the sheet's "Possible Price" column vs. the first market snapshot.
- **Manual:** you can set it in Settings.

**"Left market"** is how many tickets disappeared from listings over 7 days, whether sold or delisted. No marketplace publishes completed sale prices for free, so this plus your own logged sales is the best available "recent transactions" signal.

## One-time Google setup (about 10 minutes, Phil does this once)

1. Go to <https://console.cloud.google.com/> and create a project, e.g. "Sixers Seats".
2. **APIs & Services → Library**: search for **Google Sheets API** and click **Enable**.
3. **Google Auth Platform → Branding**: fill in an app name ("Sixers Seats") and your email.
4. **Audience**:
   - User type **External**, publishing status **Testing**.
   - Under **Test users**, add `philforrence@gmail.com` and `mozartpc27@gmail.com`.
5. **Clients → Create client → Web application**:
   - Under **Authorized JavaScript origins**, add:
     - `https://philforrence.github.io`
     - `http://localhost:8080` (for local testing)
   - Leave redirect URIs empty.
6. Copy the **Client ID** into `js/config.js` → `CLIENT_ID`.
7. **Share the Google Sheet** with `mozartpc27@gmail.com` as an **Editor**, if it isn't already.

The first time each of you signs in, Google shows "Google hasn't verified this app". That's expected for a private Testing-mode app: click **Continue**. On first load the app adds two tabs to the sheet, **App Data** (listings, sales, seats) and **App Settings**. Your **Home Games** tab stays the source of truth for the schedule and interest columns, and the app writes "What we actually doin", the interest checkboxes, "Want to Sell", "Decision Made" and "Note" back to it.

## Hosting on GitHub Pages

1. Push this folder to a GitHub repo, e.g. `philforrence/sixers-seats`. It needs to be **public** on a free GitHub plan; the data itself stays private in your sheet.
2. Go to **Settings → Pages → Build and deployment**, choose **Deploy from a branch**, then `main` / `/ (root)`.
3. Go to **Actions** and enable workflows. "Snapshot ticket prices" then runs at about 9am and 7pm ET. You can also click **Run workflow** to start it by hand.
4. Optional: get a free SeatGeek client ID at <https://seatgeek.com/account/develop> and add it as the repo secret `SEATGEEK_CLIENT_ID`. That adds SeatGeek average/median prices to the snapshots.

The site is at `https://philforrence.github.io/sixers-seats/`. On a phone, use Share → **Add to Home Screen** for an app-like icon.

## Local development

```bash
node scripts/serve.mjs 8080      # http://localhost:8080
node scripts/fetch-prices.mjs    # refresh data/prices.json
```

With `CLIENT_ID` empty, the app runs in **demo mode** with a snapshot of the sheet, saved only in your browser. Add `?demo` to the URL to force demo mode.

## Notes on the 2026-27 rules (as reported)
- The Inquirer (Sep 22, 2026) reported that full-season members' penalty-free resale allowance dropped from **10 games to 7**. It also reported transfers through the Ticketmaster member portal being blocked, and "broker" warnings to some accounts. The app tracks planned and completed resales against the cap you set in Settings.
- Seller fee defaults are typical rates, not official ones: Ticketmaster 15%, StubHub 15%, SeatGeek 10%, Vivid 10%, TickPick 15%. The listing preview on each site shows the exact fee.
