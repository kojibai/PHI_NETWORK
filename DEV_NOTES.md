# Distribution Hooks Notes

## What changed
- Added OG HTML/meta rendering for `/verify/:slug` and a PNG OG image endpoint at `/api/og/verify`.
- Added share + receipt-copy actions to the verifier UI once a capsule is loaded.
- Added `/embed/verify/:slug` lightweight badge route.

## Local testing
- `npm run dev` (and if needed `npm run dev:api` for proof API)
- Visit `http://localhost:5173/verify/10042371-abcdef1234`
  - Inhale a ΦKey → verify → use Share + Copy Receipt JSON.
- Visit `http://localhost:5173/embed/verify/10042371-abcdef1234`
- OG image: `http://localhost:5173/api/og/verify?slug=10042371-abcdef1234`

## Example URLs
- Verifier: `https://verahai.com/verify/10042371-abcdef1234`
- Embed: `https://verahai.com/embed/verify/10042371-abcdef1234`
- OG image: `https://verahai.com/api/og/verify?slug=10042371-abcdef1234`
