# Deploying Eden (click-by-click)

## 1. Push to GitHub

1. Create a new repository on GitHub (e.g. `eden`).
2. In this folder run:
   ```bash
   git init
   git add .
   git commit -m "Eden v1"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/eden.git
   git push -u origin main
   ```

## 2. Set up Supabase (memory)

1. Go to https://supabase.com → **New project**.
2. When it's ready, open **SQL Editor** (left sidebar).
3. Paste the entire contents of `supabase/migrations/0001_init.sql` → **Run**.
4. (Optional) Paste `supabase/seed.sql` → **Run**.
5. Go to **Project Settings → API** and copy three values:
   - Project URL
   - `anon` public key
   - `service_role` secret key

## 3. Deploy on Vercel

1. Go to https://vercel.com → **Add New → Project**.
2. Import your `eden` repository. Framework auto-detects as Next.js.
3. Before clicking Deploy, open **Environment Variables** and add:

   | Name | Value |
   | --- | --- |
   | `ANTHROPIC_API_KEY` | your key (or use OPENAI_API_KEY / GOOGLE_API_KEY) |
   | `EDEN_AI_PROVIDER` | `auto` |
   | `NEXT_PUBLIC_SUPABASE_URL` | Project URL from step 2 |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key from step 2 |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role key from step 2 |
   | `EDEN_USER_TITLE` | `Sir` |
   | `EDEN_OWNER_NAME` | your name |

4. Click **Deploy**. Ninety seconds later, Eden is alive.

## 4. Verify

- The top bar should read your AI provider (e.g. ANTHROPIC) and
  **MEMORY: PERSISTENT**.
- Type *"remember that my favourite colour is blue"*, then in a new
  message ask *"what's my favourite colour?"*

## Troubleshooting

- **MEMORY: VOLATILE** → Supabase env vars are missing or wrong. Check
  step 3 and redeploy.
- **"My cognitive core is not yet connected"** → no AI key configured.
- Anything else → Vercel dashboard → your project → **Logs**.
