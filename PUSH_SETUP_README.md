# Harada iPhone Push Notifications — Setup

This update adds opt-in push notifications for **nudges**. It does not send friend-request or celebration pushes. The original in-app nudges remain available even if push fails. This is a prepared build, **not yet live tested**.

## 1. Back up and database

- In your existing Harada app: Settings → Export backup. Keep that JSON file safe.
- Supabase → SQL Editor → New query: paste `push-setup.sql`, Run.

## 2. Edge Function (one-time)

- Supabase → Edge Functions → Create new function. Name: `harada-send-push`.
- Paste **all** of `supabase/functions/harada-send-push/index.ts` into the function editor, replacing the template. Deploy.
- In function settings, **turn OFF the Supabase gateway's “Verify JWT” setting**. The function itself checks the signed-in user's JWT against Supabase Auth and checks that the nudge belongs to that sender. This is necessary for compatibility with newer publishable keys.
- Supabase → Edge Functions → Secrets: set `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` using the **separate** `harada_push_private_setup.txt` file provided with this download. **Never upload the private setup file to GitHub or put the private key in browser code.**
- Supabase normally supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to Edge Functions automatically. Confirm both are available as function environment variables.
- The `mailto:harada-notifications@example.com` contact in the function is a placeholder. Replace it with a real address you control before production use.

## 3. Publish app

- Upload the app files in this ZIP to the root of your existing Harada GitHub repository. **Do not upload** the SQL, readme, or `supabase/` directory.
- `friends-config.js` contains only public values, including the VAPID **public** key.
- Do not clear Safari storage or delete/reinstall Harada before backing up your goals.
- GitHub Pages may take a few minutes to deploy. Open the Home Screen app and relaunch it to get the new service worker.

## 4. On BOTH iPhones

- Use iOS 16.4 or later.
- Open `https://logankee.github.io/Harada/` in **Safari** → Share → **Add to Home Screen** → Add.
- Launch Harada from the new Home Screen icon (not a Safari tab).
- Sign in to Friends and tap **Enable notifications**; accept the iOS permission prompt.
- On the other phone, nudge a shared, incomplete goal. The recipient should see an iOS notification even with Harada closed. Test the other direction too.

## Limitations / troubleshooting

- iPhone web push requires Home Screen installation, user gesture permission, and internet access. Focus settings may silence notifications.
- If the in-app nudge works but no push arrives: check Supabase Edge Function logs, VAPID secrets, iPhone notification permissions, and the `harada_push_subscriptions` table.
- If `npm:web-push` cannot run in the Edge Runtime, the function will need a compatible runtime or alternate push sender; this code has not been verified against a live Supabase project.
- A notification click opens Harada. It does not currently deep-link to the exact nudge.
- Each device needs to opt in separately; a user may have more than one subscription.
- The sending function has a 5-minute window for new nudges and prevents repeated sends for the same nudge.
