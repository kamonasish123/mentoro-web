
# Kamonasish Portfolio — Next.js + Tailwind Starter (Responsive)

## Quick start (run locally)
1. Install Node.js (v18+ recommended).
2. Extract the project and open a terminal in the project folder.
3. Install dependencies:
   ```bash
   npm install
   ```
4. Run development server:
   ```bash
   npm run dev
   ```
5. Open http://localhost:3000 in your browser.

## Mobile testing (on your phone)
- Make sure your phone and dev machine are on the same Wi‑Fi network.
- Find your computer's local IP (Windows: `ipconfig`, Linux/macOS: `ifconfig` or `ip a`). Suppose it's `192.168.1.12`.
- Start dev server as usual. Next.js binds to all interfaces by default in dev, if it does not, run:
  ```bash
  npx next dev -H 0.0.0.0 -p 3000
  ```
- Open on your phone's browser: `http://192.168.1.12:3000`

Alternative: deploy to Vercel for instant public preview (recommended for sharing).

## Notes on responsiveness & improvements
- The app is mobile-first using Tailwind responsive utilities (sm:, md:, lg:).
- Replace `/public/avatar.jpg` with your real photo (same filename) to avoid editing code.
- To add SEO meta, edit `pages/index.js` head section.
- I can convert this to App Router, add MDX for projects, or connect a lightweight CMS if you prefer.

