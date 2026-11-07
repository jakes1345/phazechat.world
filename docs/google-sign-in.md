# Sign in with Google

Google is an extra way in, next to username and password. The server does all
of it (`nexus_server/google_auth.go`); the web app and the Android app only
show the button and the step that can follow it.

## How it works

**Web.** The button is a link to `/api/v1/auth/google/start`. The server
sends the browser to Google with the authorization code flow, PKCE (S256), a
random `state` held in a short-lived cookie and a `nonce`. Google sends the
browser back to `/api/v1/auth/google/callback`; the server swaps the code for
an ID token with the client secret, checks the token (below) and either signs
the person in (session cookie, as with a password) or sends them to `/web/`
with the one step still needed in the URL fragment. The web app reads the
fragment and clears it.

**Android.** The app gets a one-time nonce from `/api/v1/auth/google/nonce`,
opens Google's account sheet with Credential Manager
(`GetSignInWithGoogleOption`, the web client ID as `serverClientId`), and
posts the ID token to `/api/v1/auth/google/idtoken`. It gets back a Phaze
session token, the same kind password sign-in gives.

**Checking the ID token.** RS256 signature against Google's published keys
(cached for as long as Google's `Cache-Control` says), `iss` is Google,
`aud` is our web client ID, not expired, `email_verified` is true, and the
`nonce` is the one this server issued for this sign-in, used once.

**Which account.** A Google account is tied to a Phaze account by Google's
stable account ID (`sub`), not by email.

- Already tied: signed in. If the account has 2FA, the code is still asked for.
- Not tied, and a Phaze account has the same email: the person types that
  account's password once to connect them (plus the 2FA code if it's on).
  Nothing is connected on a matching email alone.
- Not tied, no account with that email: they pick a username and a new
  account is made, already verified (Google verified the email).
- Settings > Security can connect Google to the signed-in account, or
  disconnect it. An account made with Google has no password until its owner
  sets one with "Forgot password?", and can't disconnect Google before then.

Every follow-up step uses a single-use ticket stored hashed, valid for 15
minutes and 5 tries. Sign-up keeps the usual checks (rate limit, VPN check,
disposable-email check), and bans apply as they do to password sign-in.

## Setup

Until `PHAZE_GOOGLE_CLIENT_ID` is set the server reports Google as off and
neither app shows the button.

1. In [Google Cloud console](https://console.cloud.google.com/), make or pick
   a project, then open **Google Auth Platform**.
2. **Branding:** app name `Phaze`, support email, the app's home page
   `https://phazechat.world`, and `phazechat.world` as an authorized domain.
3. **Audience:** External, then **Publish app**. The scopes used (`openid`,
   `email`, `profile`) don't need Google's verification review.
4. **Clients > Create client > Web application.** Authorized redirect URI:
   `https://phazechat.world/api/v1/auth/google/callback`. Keep the client ID
   and client secret.
5. **Clients > Create client > Android.** Package name `world.phazechat.app`
   and the SHA-1 of the release signing certificate. Run the
   *Android signing fingerprint* workflow (Actions tab > Run workflow) to get
   it. If the app is also on Google Play with Play App Signing, add a second
   Android client with the SHA-1 from Play Console > App integrity.
6. Worker secrets, from `cloudflare/`:

   ```
   npx wrangler secret put PHAZE_GOOGLE_CLIENT_ID
   npx wrangler secret put PHAZE_GOOGLE_CLIENT_SECRET
   ```

   They reach the server on the container's next start.

`PHAZE_PUBLIC_URL` sets the origin Google sends people back to; it defaults to
`https://phazechat.world` and only needs setting for another domain (its
redirect URI then needs adding to the web client too).
