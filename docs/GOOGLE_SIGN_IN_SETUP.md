# Axion Mind — Google sign-in setup

## Current status

Google sign-in requires both the app implementation and provider configuration.
Google is now enabled in Supabase and real Google SSO has been verified for arafat.trans@gmail.com, including restart, logout and fresh sign-in. The OAuth client belongs to Google Cloud project gen-lang-client-0573839341 and remains in External/Testing mode. See GOOGLE_SSO_E2E_VERIFICATION.json and GOOGLE_SSO_GATES.md for current evidence.

## One-time Google / Supabase configuration

1. Sign into Google Cloud Console: https://console.cloud.google.com/auth/overview
2. Select the Google Cloud project that should own Axion Mind authentication. Configure branding and audience. For an External app in Testing, add the intended Google accounts as test users; broader availability may require publishing the consent screen and Google verification.
3. Create an OAuth client of type **Web application**, named `Axion Mind Supabase`.
4. Add this exact Authorized redirect URI in Google:

   https://kefxeysyvtdxxdupkapa.supabase.co/auth/v1/callback

5. Open the Supabase Google provider settings:

   https://supabase.com/dashboard/project/kefxeysyvtdxxdupkapa/auth/providers?provider=Google

6. Enable Google and enter the Google Client ID and Client Secret directly into Supabase. Do not put the client secret in Axion Mind, source code, chat, or logs. Do not enable Skip nonce checks just to bypass configuration problems.
7. In Supabase Authentication → URL Configuration → Redirect URLs, add:

   http://127.0.0.1:43821/auth/callback/*

   This is a narrowly scoped loopback redirect. The final path segment is randomly generated for each attempt. Do not replace the Google callback URI in step 4 with this loopback address: they serve different purposes.
8. Save and verify that Supabase's public auth settings now report Google as enabled.

## User flow

1. Open Axion Mind → account/cloud button.
2. Click `Continue with Google`.
3. In the normal system browser, choose a Google account and approve the sign-in.
4. Return to Axion Mind. Only a Supabase-validated session should display the account as signed in.
5. Click `Force Cloud Sync Now` separately to synchronize. Signing in by itself does not prove that cloud records are synchronized.

Choose the same Google email as the existing cloud account if you want Supabase's documented automatic identity linking to apply. Verify the resulting user ID and existing data after the first login; do not assume a different email owns the same records.

## Security changes

- Removed the hardcoded personal quick-login button and password prefill.
- Removed simulated successful local authentication.
- Browser localStorage is no longer used to persist session tokens; the backend is authoritative.
- Native OAuth uses the system browser, PKCE, and a short-lived loopback callback, not an embedded Google password form.
- OAuth client secrets belong only in Supabase's provider configuration.
- Earlier setup scripts and old local session files may still contain credentials. They are not a credential vault. Rotate the previously provisioned password and revoke old sessions before distributing any prior builds; Google sign-in does not itself rotate that password.

## Verification boundaries

Frontend tests use clearly labelled fixtures and prove UI state handling, not Google authentication. Native unit tests prove protocol parsing, PKCE and storage behavior within their tested boundaries. Only a real browser login with the provider enabled proves end-to-end Google authentication.

References:
- https://supabase.com/docs/guides/auth/social-login/auth-google
- https://supabase.com/docs/guides/auth/redirect-urls
- https://supabase.com/docs/guides/auth/auth-identity-linking
