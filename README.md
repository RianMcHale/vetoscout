# VetoScout — CS2 FACEIT Veto Advisor

Analyse any FACEIT opponent's map tendencies from a match room URL. Get ban frequency, win rates, pick patterns, and an optimal veto strategy — all from your own private API key.

## Stack

- **Frontend**: React + Vite (runs on port 5173)
- **Backend**: Node.js + Express (runs on port 3001)
- **API**: FACEIT Open Data API v4

## Setup

### 1. Install dependencies

```bash
npm run install:all
```

### 2. Add your FACEIT API key

Edit `server/.env`:

```
FACEIT_API_KEY=your_actual_key_here
PORT=3001
```

Get a key at: https://developers.faceit.com → Apps → Create app → API Key

### 3. Run the app

```bash
npm run dev
```

This starts both the Express server (`:3001`) and the Vite dev server (`:5173`) concurrently.

Open **http://localhost:5173** in your browser.

## Usage

1. Paste a FACEIT match room URL (e.g. `https://www.faceit.com/en/cs2/room/1-abc123...`)
2. Enter your team name so the app knows which side is the opponent
3. Optionally exclude maps no longer in rotation (e.g. `Train`)
4. Hit **Analyze**

## What you get

- Ban frequency chart — which maps they avoid
- Win rate by map — their comfort maps vs weak spots
- Maps played count — total exposure per map
- Picked vs landed on — did they choose it or just end up on it?
- Optimal veto recommendation — your bans & predicted opponent bans
- Post-ban scenario — most likely map to be played with probability bars

## Project Structure

```
vetoscout/
├── server/
│   ├── index.js        # Express API server
│   ├── .env            # Your API key (never commit this)
│   └── .env.example    # Template
└── client/
    ├── src/
    │   ├── components/ # React UI components
    │   ├── hooks/      # useAnalyze data hook
    │   ├── lib/        # Map constants & helpers
    │   ├── App.jsx
    │   └── main.jsx
    └── vite.config.js  # Proxy /api → :3001
```
