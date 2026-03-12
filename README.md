# PoshPulse 🌟

Automated Poshmark closet manager. Keeps your listings fresh and your closet active — 24/7.

## What it does

- **Shares** every active listing in your closet every 60 minutes (95s between each click)
- **Relists** any listing that's 61+ days old (90s between each relist)
- **Emails** you a daily recap of all relists with timestamps
- **Alerts** you immediately if a CAPTCHA is detected

## Stack

- Node.js + Playwright (headless Chromium)
- Railway (always-on hosting)
- Nodemailer + Gmail SMTP

## Setup

### 1. Environment variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

Required vars:
| Variable | Description |
|---|---|
| `POSHMARK_USERNAME` | Your Poshmark username |
| `POSHMARK_PASSWORD` | Your Poshmark password |
| `SMTP_USER` | Gmail address for sending notifications |
| `SMTP_PASS` | Gmail [App Password](https://support.google.com/accounts/answer/185833) |

### 2. Install dependencies

```bash
npm install
```

### 3. Run locally

```bash
npm start
```

### 4. Deploy to Railway

1. Create a new Railway project
2. Connect this GitHub repo
3. Add all environment variables in Railway dashboard
4. Deploy — Railway will use `nixpacks.toml` to install system Chromium

## Timing defaults

| Setting | Default | Env var |
|---|---|---|
| Share interval | 95 seconds | `SHARE_INTERVAL_MS` |
| Share cycle | 60 minutes | `SHARE_CYCLE_MS` |
| Relist gap | 90 seconds | `RELIST_INTERVAL_MS` |
| Relist age threshold | 61 days | `RELIST_AGE_DAYS` |
| Relist check frequency | 60 minutes | `RELIST_CHECK_INTERVAL_MS` |

## Notes

- The relist flow will be refined once Poshmark credentials are provided and we can observe the exact UI interactions needed
- Gmail App Passwords are required (not your regular Gmail password)
