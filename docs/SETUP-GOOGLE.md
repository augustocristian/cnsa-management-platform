# Setting up the Google Drive connection (5 minutes, one time only)

The app **has no sign-in and no user accounts**: it never knows who the person is (no name, e-mail or picture is requested, shown or stored). The person only **connects Google Drive**, which is an OAuth _authorization_ (Google Identity Services token flow) with a single permission, `drive.file`. For that the app needs a Google client ID, set up once by whoever publishes it.

While no client ID is set the app can still be shown and tried in **demo mode** (_Try the demo_ on the _Configuration needed_ screen): sample data kept only in the browser, never sent to Drive. **The demo is available only without a client ID** (neither saved in the browser nor in `js/infrastructure/config.js`). As soon as one is set, the start screen offers only _Connect Google Drive_; a demo left open is closed on the next start with a notice and its data is erased.

## Who does what

- **The deployment owner** (whoever publishes the app) creates the Client ID **once** and puts it in `js/infrastructure/config.js`. Nothing else has to be configured per user.
- **End users** only click _Connect Google Drive_. Google shows its consent screen **once** ("CNL Plataforma wants to see and manage the files it creates in your Drive"); after that the app reconnects silently on every visit. They never see the Google Cloud console.
- **Each person's data is isolated**: it lives in the Drive that person connected (`cnl` folder). Drive is used only so the data persists and is available on all of that person's devices (for example computer and phone). It is **not** a shared database: the app has no sharing, roles or multi-user features, and it shares data with nobody. The swimmers, groups, etc. are records the person manages, not app users.

Everything is stored in the `cnl` folder of the user's Drive with **a single data permission, `drive.file`** (the app can only access the files it creates itself). That permission **is not sensitive**, does not require Google verification and **the Google Sheets API does not need to be enabled**: only the Drive API.

The app's own interactive tutorial (the _Tutorial_ menu, or the link on the _Configuration needed_ screen) walks through these same steps with copy buttons.

## 1. Create the project

1. Open <https://console.cloud.google.com/> with your Google account (only the owner needs this).
2. Project selector > **New project**. Name it, for example, `CNL Plataforma`, and create it.

## 2. Enable the Google Drive API

1. Open <https://console.cloud.google.com/apis/library/drive.googleapis.com> and click **Enable**.
2. _(Only if you will sync with Google Calendar)_ also enable **Google Calendar API**.

## 3. OAuth consent screen

1. Menu **APIs & Services > OAuth consent screen** (or **Google Auth Platform**).
2. User type: **External**. Fill in the app name, support email and contact email.
3. Under **Scopes** add **only** `https://www.googleapis.com/auth/drive.file`. Do **not** add `openid`, `email` or `profile`: the app does not use them and asks for no identity. If you will use Google Calendar sync, the `https://www.googleapis.com/auth/calendar.events` scope is requested **only when the user clicks _Sync with Google Calendar_**, not when connecting Drive.
4. Choose who can connect:
   - While the consent screen is in **Testing** mode, only the Google accounts listed under **Test users** can connect (up to 100); Google shows its "unverified app" warning to them. Add every person who will try the app.
   - Or click **Publish app** to remove that limit. Because `drive.file` is a non-sensitive scope, publishing does **not** require Google verification: anyone can then connect their Drive and each one only ever sees their own data.

## 4. Create the OAuth client ID

1. **APIs & Services > Credentials > Create credentials > OAuth client ID**.
2. Application type: **Web application**.
3. Under **Authorized JavaScript origins** add:
   - `https://augustocristian.github.io` (GitHub Pages)
   - (for development) `http://localhost:8080` or the port you use
4. No redirect URI is needed (the Google Identity Services token flow is used).
5. Click **Create** and copy the **client ID** (it ends in `.apps.googleusercontent.com`).

## 5. Paste the ID into the app

Edit `js/infrastructure/config.js` and paste it between the quotes of `BUILTIN_CLIENT_ID`:

```js
const BUILTIN_CLIENT_ID = '1234567890-abc.apps.googleusercontent.com';
```

Push the change to GitHub Pages. The client ID is not a secret and can live in the repository.

To try it **before** publishing, open the app: while the constant is empty you will see _Configuration needed_, with a field to paste the ID and **Test and save** (it opens Google's consent window; if it works, the ID is kept only in that browser, in `localStorage['cnl:clientId']`). That screen also shows the page's **current origin** (copy it in step 4 if Google reports `origin_mismatch`).

## 6. How it works for each user

- The first time, a two-step wizard creates the person's **empty** club (no sample data) in `cnl/<ClubName>.json`.
- The `cnl` folder in the person's Drive contains: `<Club>.json` (all the club's data and settings, one file per club), `preferencias.json` (language, last club, tutorial progress, calendar view and reminder, Google Calendar sync map), `entrenos/` (training PDFs), `backups/` (automatic safety copies: the last 14 daily ones, plus the ones taken before an Excel import or a backup restore) and, if created, the `<Club>.xlsx` copy.
- **Existing `cnl` folder**: with `drive.file` the app cannot see folders or files it did not create. If the person already had a hand-made `cnl` folder, the app creates (and reuses) its own; they can move their files from Drive. It does not duplicate: if the app's folder already exists it is reused.
- Changes are saved automatically (after a few seconds), with a local cache so the app works offline and a queue of pending changes that is uploaded when the network returns. If the same person edits from another device, the app detects the change (`md5Checksum`/`modifiedTime`) and merges field by field without losing anything.
- **Backup**: _Configuration_ lets the person export/import `.xlsx`, save a copy in `cnl/`, and make a complete **Backup** (one JSON file, optionally encrypted with a passphrase) that can be downloaded, stored in Drive and restored (replace or merge). Restoring always takes a safety copy first.
- _Disconnect Drive_ **revokes** the permission granted to the app and clears the local cache on that device (it first uploads pending changes, or offers a downloadable copy).
- **Demo mode** (_Try the demo_, only while there is no client ID) works without connecting: its data lives only in the browser (`localStorage` keys `cnl:demo:*`), a banner says so, and _Exit demo_ erases it. From the demo banner, _Set up Google Drive_ opens the _Configuration needed_ screen so the owner can paste the client ID; connecting then closes the demo and starts an empty real club; demo data never reaches Drive. Backups in Drive and Google Calendar sync are disabled in the demo.

## Common problems

- **"Access blocked" / "app not verified" / `access_denied`**: the person's Google account is not listed under **Test users** (step 3.4) while the app is in _Testing_ mode. Add it (the app links to the consent screen) or publish the app.
- **`origin_mismatch` / "origin not authorized"**: the origin the app is opened from is missing from step 4.3 (check `https`, the port and that there is no trailing slash). The app shows the current origin so it can be copied.
- **The popup does not open / closes by itself**: the browser blocks it; allow the site's pop-ups and click the button again.
- **"The Google Drive API is not enabled"** (403 `accessNotConfigured`): enable it in step 2; the app shows the direct activation link.
- **"Google denied access to your Drive"** (403): disconnect Drive and connect it again, accepting the files permission.
- **The Drive connection expires**: the app shows "Drive connection expired: Reconnect"; in _Testing_ mode Google may end it after 7 days. Click _Reconnect_ (no data is lost).

## 7. Sync with Google Calendar (optional)

- Requires the **Google Calendar API** enabled (step 2) and the `calendar.events` scope. In _Testing_ mode the person's Google account must be a test user; Google shows the unverified-app warning until the app is published and verified (this scope is sensitive).
- When the user clicks **Sync with Google Calendar** in _Calendar_, Google asks for the additional permission (incremental consent). Events are created in the **primary calendar** tagged with a private property (`cnlId`, `cnlClub`).
- **Stop syncing** removes from Google Calendar the events the app created. The sync map is saved in the person's Drive preferences (`cnl/preferencias.json`); if it is lost, the app finds the events again by their tag and does not duplicate them.
- Error _API has not been used / is disabled_: enable Google Calendar API. 403 permission error: click the button again and accept access to events.
