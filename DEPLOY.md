# Deploy

This is a **static site**. Serve the `web/` folder with any static web server (nginx, Caddy, GitHub Pages). All paths are relative, so it works at a domain root or under a subpath. No backend, no ports, no build step.

## Data refresh

`web/data/*.json` must be refreshed once a day, after 00:00 UTC. Two options:

1. **Pull from GitHub (simplest).** The GitHub Action in `.github/workflows/pages.yml` commits fresh data to `main` every day at 01:30 UTC. On the server, `git pull` once a day (for example at 02:00 UTC) and serve `web/`.
2. **Run the pipeline on the server.** Requires Python 3.10+ (standard library only). Once a day:

   ```bash
   python3 pipeline/update.py
   ```

   It makes 5 HTTP calls (2 to api.xrpl.to, 3 to data-api.binance.vision), writes `raw/` and `web/data/`, and exits non-zero without retrying on any HTTP error.

## Environment

| Variable | Required | Purpose |
|---|---|---|
| `XRPLTO_API_KEY` | no | xrpl.to API key. Anonymous access allows 333 requests/day, far above the 2 this uses. |

## Requirements from data providers

- Keep the "Data by xrpl.to" link visible on the page.
- Don't re-serve `web/data/*.json` as a public API.
