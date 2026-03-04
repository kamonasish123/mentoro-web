# Mentoro Web (Kamonasish.com)

Full-stack mentoring and learning platform for competitive programming, built with Next.js and Supabase. It includes a public portfolio, courses with problem tracking, a blogging system, and a role-based admin dashboard.

## Public Demo
- https://mentoro-web.vercel.app

## Highlights
- Portfolio and About pages with curated achievements, projects, and skills.
- Courses with problem lists, attempt/solve tracking, difficulty badges, and solution unlock timers.
- Ranklists (top 10 and full) with tie-break by earliest solve.
- Blog with Markdown editor, preview, drafts (auto-save), comments/replies, likes, and share links.
- Role-based admin dashboard (super_admin only for write operations).
- Light/dark mode for course pages.
- Mobile-first responsive UI.

## Tech Stack
- Next.js 13 (Pages Router)
- React 18
- Supabase (Auth + Postgres + Storage)
- Tailwind CSS (utility + custom styling)
- react-markdown + remark-gfm (blog rendering)

## Local Setup
1. Install Node.js (v18+).
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create `.env.local` (see below).
4. Run the dev server:
   ```bash
   npm run dev
   ```
   App runs at `http://localhost:3000`.

## Environment Variables
Create a `.env.local` with:
```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# Optional (signup captcha)
NEXT_PUBLIC_HCAPTCHA_SITE_KEY=your_hcaptcha_site_key
HCAPTCHA_SECRET_KEY=your_hcaptcha_secret_key
```

## Supabase Notes
This project expects Supabase tables, policies, and storage to be configured. Make sure:
- Auth is enabled (email/password).
- `profiles` table contains user roles (e.g., `super_admin`).
- Blog and course tables exist (posts, comments, replies, courses, problems, attempts, solves, votes).

If you need the exact schema or policies, open an issue or check your Supabase SQL migrations.

## Scripts
```bash
npm run dev      # Start dev server
npm run build    # Build for production
npm run start    # Start production server
```

## Deployment
Recommended: Vercel.  
Set the same environment variables in Vercel Project Settings.

## Admin Access
Only `super_admin` can create/edit courses, problems, and featured projects.  
Use the Admin Dashboard to manage content and users.

## License
All rights reserved. Contact the owner for reuse or licensing.
