# Audience CSV Builder

A small local browser tool for preparing Rokt custom audience email lists.

## What it does

- Paste or import emails from `.csv` or `.txt`.
- Normalizes emails to lowercase.
- Removes duplicates.
- Flags invalid entries.
- Downloads a clean CSV.
- Can export either plain emails or SHA-256 hashes.
- Previews API payloads for Rokt's current Event and Audience API pattern and the deprecated Custom Audience Import API.

## Use it

Open `index.html` in a browser.

For direct upload:

1. Copy `.env.example` to `.env`.
2. Add the Rokt public key, secret key, and account ID.
3. Run `node server.js`.
4. Open `http://127.0.0.1:8787`.

## Rokt upload path

Rokt's docs currently recommend the Event and Audience API for audience updates. The older Custom Audience Import API is still documented, but marked deprecated.

The included local server posts to the deprecated Custom Audience Import API because it supports batch list uploads directly. For a production version, migrate the upload route to the Event and Audience API so the audience is updated through the current server-to-server path.

Useful docs:

- Event and Audience API: https://docs.rokt.com/developers/integration-guides/getting-started/advertisers/ads-events-api-integration/
- Deprecated Custom Audience Import API: https://docs.rokt.com/developers/api-reference/custom-audience-import/
