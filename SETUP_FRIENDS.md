# Harada Friends — setup (about 15–30 minutes of account setup)

**Important:** The download contains the Friends feature, but live accounts, friend requests, and nudges **will not work until you connect your own Supabase project**. Don't upload the new ZIP before backing up your current Harada data. No Supabase account or credentials have been created on your behalf.

## 1. Back up both phones

On each phone open Harada > Settings > Export backup and save the JSON somewhere safe. The new build **keeps the existing `gbb-v2` browser-storage key** and does not overwrite your local goals. A friend account does not automatically sync all your goals between devices: only explicitly shared goal snapshots are uploaded.

## 2. Create the database

1. Create a free project at https://supabase.com/dashboard .
2. In the project's **SQL Editor**, paste the entire `supabase-setup.sql` file and run it **once**. The SQL enables row-level security so strangers cannot browse your private goals. If you rerun the script, duplicate policy errors are possible; that does not mean you should drop your tables.
3. Under **Authentication > Providers > Email**, keep Email enabled. For testing, leave email confirmations enabled and confirm each account's email before signing in. If confirmation emails don't arrive, inspect Supabase authentication email settings and rate limits.
4. Under **Authentication > URL Configuration**, set Site URL to `https://logankee.github.io/Harada/`. Add `https://logankee.github.io/Harada/**` to allowed redirect URLs if necessary.

## 3. Add public configuration to the app

1. Under **Project Settings > API** (or **Connect > API keys**, depending on dashboard version), copy the **Project URL** and **publishable/anon key**.
2. Open `friends-config.js` and fill in the two quoted values:

   ```js
   window.HARADA_SUPABASE_URL = 'https://YOUR-PROJECT.supabase.co';
   window.HARADA_SUPABASE_ANON_KEY = 'YOUR-PUBLIC-ANON-OR-PUBLISHABLE-KEY';
   ```

3. **Never paste the service_role key or any secret API key into this file.** The anon/publishable key is designed for public browser use, with access controlled by SQL row-level security.

## 4. Publish

Upload the updated **app files** to the root of the existing `LoganKee/Harada` GitHub repository (including `friends.js`, `friends-config.js`, `supabase-setup.sql` is NOT required on the website). Commit. Allow GitHub Pages a little time to deploy, then reload the app. The ZIP includes the latest white-category-icons build as its base.

## 5. Test with your girlfriend

1. Each of you opens the Friends tab and creates a separate account, confirms email, then signs in.
2. Each goes to **Friends > Share goals** and checks a few goals. **Nothing is shared by default.**
3. One copies their Friend ID from **Friends > Friends** and sends it privately to the other.
4. The other pastes the ID and sends a request. The recipient accepts it under **Requests**.
5. View each other's shared progress and tap **Nudge** next to an incomplete goal. The nudge appears under **Recent nudges** when the recipient opens or refreshes Harada.

### Current limitations

- Nudges are **in-app only**, not iOS push notifications. The app checks for updates every 30 seconds while open and visible; a manual Refresh button is also available.
- This build uploads **current progress snapshots only for goals you select**. It does not sync your entire local goal history or migrate it to a new device.
- Friend IDs are long UUIDs rather than usernames; this avoids exposing a public user directory.
- One nudge per sender, recipient, and goal per UTC day. The app also prevents nudging completed goals.
- Friend progress is view-only; friends cannot edit each other's goals.
- This is a first release; test with two accounts before distributing widely. No live Supabase backend was available for end-to-end testing during generation.
- The Supabase JavaScript SDK loads from a CDN and requires an internet connection for social features. Personal goal tracking still works offline.

### Data safety

Don't clear browser storage or uninstall the app until you have a JSON backup. Do not rename the `gbb-v2` local-storage key. Removing a goal from **Share goals** deletes its cloud snapshot after the next successful sync. You can remove friends in the Friends tab.
