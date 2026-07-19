# InvestIQ AI — session instructions

1. **Progress reporting:** on any task/question given in Claude Code, always show a rough % complete and a short (~4-7 word) description of progress.
2. **Read `docs/CONVENTIONS.md` before changing anything** — it holds the
   golden rule (never show a made-up number; every figure carries a source
   badge saying where it came from) plus the house rules and the verify
   recipe. Code review checks those rules first, in order.
3. **Read `AGENTS.md`** — this repo runs Next.js 16, which has breaking
   changes from what you may expect; its docs ship in
   `node_modules/next/dist/docs/`.
4. **Where the build stands: `docs/BUILD-PLAN.md`.** Its STATUS section at
   the top says exactly what is built and what the next session should build.
   Phases 2–6 are owner-approved and specced there; the screen designs are in
   `docs/design/`. Pages like Committee, Theses, Reviews, Stocks and
   Watchlist are "coming soon" placeholders until their phase is built.
5. The owner is **not a developer**: commit messages, reports, and summaries
   in plain English.
6. Commanders (dev-lead etc.) never commit or push — the main session does.
