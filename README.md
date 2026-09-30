# Money Home

One start page for ATS, the Expense Tracker, the 16-Year Ledger and Trip Vault: https://anilgupta2606.github.io/

Nothing personal is in this repository. The page reads, in your own browser, what the Expense Tracker
and the Ledger keep there, and ATS on your Mac when it is running. Same sign-in as the Expense Tracker.

## Setup, AI and Ask AI

- **`/setup/`, Setup - do it once per device:** a GitHub token and a passphrase turn on sync for Trip Vault,
  the Ledger and the Expense Tracker at once, and carry the AI keys and the sign-in (the Expense Tracker's, as its
  hash) to your other devices in one encrypted gist. A new phone: sign in with admin / admin, open Setup, enter the
  same token and passphrase - then the laptop's password works everywhere and admin / admin stops.
- **AI keys (in Setup; `/ai/` goes there):** one set of AI keys for every app on this site (Money Home, Trip Vault, the 16-Year Ledger,
  the Expense Tracker). Test each key, choose which AI goes first, and whether the others take over when it fails.
  Keys already in any of the apps are picked up by themselves. They stay in this browser and go only to the AI services.
- **`/ai/ai.js`, the central AI:** the best service answers first (free ones, then Ollama on this computer, then paid
  Claude), each with its best model first (the strongest for real work, a quick one for checks; the one that answered
  last time goes first). A service out of free quota rests 15 minutes while the next answers. Trip Vault and the Ledger
  call it; the Expense Tracker uses its keys.
- **Ask AI** on Money Home answers from the numbers on the page: the plan, spending, trips and ATS holdings.
