# Eldeco La Vida Bella: website + lead CRM

One Node.js service that serves the landing page, saves every enquiry on the server, and gives you a password-protected CRM at `/admin`.

## Run locally
```
npm install
npm start          # http://localhost:3000   (admin: http://localhost:3000/admin)
```
Local dev login (only when NODE_ENV is not "production"): `admin@example.com` / `admin123`.

## Deploy (any host that runs Node 18+)
1. Upload this folder (without `node_modules`) or push it to GitHub.
2. Create the two secrets:
   ```
   npm run hash-password -- "YourStrongPassword"
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
3. Set the environment variables from `.env.example` in your host's dashboard:
   `NODE_ENV=production`, `SITE_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`, `SESSION_SECRET`, `DATA_DIR`.
4. Start command: `npm install --omit=dev && npm start` (or build the included `Dockerfile`).
5. Point your domain / subdomain at it and enable HTTPS (Render, Railway, Fly.io, or a VPS with Nginx + Certbot all do this).

**Important: leads are stored in `DATA_DIR/leads.json`, so that folder must be on a persistent disk or volume.**
Free tiers with temporary disks will lose leads on every restart. Set `WEBHOOK_URL` as well so every lead is also pushed to a Google Sheet, Zapier, Make or Slack as a backup. Back up `leads.json` regularly.

## Before you go live (please check)
- **Hero image:** add your licensed photo as `public/assets/img/hero.jpg`. Without it the page shows a clean tower illustration instead. I did not hotlink the developer's images.
- **Brochure:** upload a PDF somewhere and set `BROCHURE_URL`; visitors get a download button after submitting.
- **Amenities list** in the Amenities section is a typical luxury-society list. Edit it to match the RERA-registered specifications.
- **Footer disclaimer** says the site is run by an independent sales channel. Change it to match your actual status; RERA rules restrict misrepresenting who you are.
- **Privacy Policy** (`public/privacy.html`) is a plain-language starting point for DPDP Act compliance. Have a lawyer review it.
- Ad campaigns: add `?utm_source=google&utm_campaign=name` to ad links; they are saved with each lead.

## After editing HTML or JS
Tailwind CSS is pre-built. If you add new Tailwind classes run `npm install` then `npm run build:css`.

## What's in the box
| Path | Purpose |
|---|---|
| `server.js` | Web server, lead API, admin API, security |
| `public/index.html`, `public/assets/js/app.js` | Landing page, forms, assistant |
| `views/admin.html`, `public/assets/js/admin.js` | CRM |
| `public/privacy.html` | Privacy policy |
