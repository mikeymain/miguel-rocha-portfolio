# Aurora Steam readiness

Assessed 11 November 2026. This is a release-planning assessment, not a confirmation that Valve will accept the application.

## Main gate: eligibility

Aurora is a Windows calendar, alarms, email-event and sports-schedule application. Valve primarily accepts games; its published non-game list is Animation & Modeling, Audio/Video Production, Design & Illustration, Photo Editing, Educational & Tutorials, Finance & Accounting, Player Tools, and SteamVR Tools. A general calendar does not clearly fit. Sports reminders alone do not establish Player Tools eligibility. Obtain a category decision from Steamworks Support before paying the fee.

Source: https://partner.steamgames.com/steamdirect/

## Engineering effort

The application already uses Electron and electron-builder. A Windows Steam build can use the unpacked application directory, with a configured executable, depot, and SteamPipe upload. A framework rewrite is unnecessary. Steamworks API integration is optional; achievements, overlay bindings and Steam Cloud are not prerequisites.

Estimate after Valve accepts the category: 3-7 focused development days for packaging, launch/update/tray testing, store assets, notices, and a local/import-based edition. A broadly available Google-connected edition could add 1-3 development weeks plus external verification time. These are engineering estimates, not vendor delivery promises.

Sources:

- https://partner.steamgames.com/doc/sdk/uploading
- https://partner.steamgames.com/doc/sdk/api%20

## Fees and timing

Steam Direct charges USD 100 per product. The fee is nonrefundable but recoupable after USD 1000 adjusted gross revenue. Live Direct and onboarding documentation checked today state a 21-day wait after paying the fee; older search snippets saying 30 days are stale. The public Coming Soon page must be up at least two weeks. Detailed review guidance allows 3-5 business days for page/build review and recommends submitting at least 7 business days ahead to allow corrections. Identity, banking and tax onboarding adds its own time. Do not promise a launch date before these gates clear.

Sources:

- https://partner.steamgames.com/steamdirect/
- https://partner.steamgames.com/doc/gettingstarted/onboarding
- https://partner.steamgames.com/doc/gettingstarted/appfee
- https://partner.steamgames.com/doc/store/review_process

## Product work before a submission

1. Google: the current app asks users for their own Desktop OAuth client. A retail-friendly shared OAuth client needs production consent/branding, public privacy information, and verification for the requested scopes. Gmail read-only is a restricted scope. Google determines whether additional security assessment requirements apply to this local-desktop architecture; do not assume a blanket exemption or cost.
2. Sports: the application resolves third-party stream links. No broadcast authorization has been established. Replace these with authorized providers or obtain documented rights before a commercial submission; separately check sports-data/logo terms. This is a distribution risk assessment, not a legal finding about a specific service.
3. Background operation: test Steam launch, close-to-tray, reopening, Steam exit, reboot/login startup, and updates while the tray process is running. Alarms require the application and PC to be running; Aurora does not wake a sleeping PC.
4. Steam Cloud: start without it. Do not sync the whole data directory, which contains encrypted account credentials and account/calendar caches. Any future cloud support needs an intentional credential-free data selection and conflict design.
5. Licensing: retain the applicable third-party notices. React Bits' current terms allow paid products containing its components, with attribution and restrictions on standalone component redistribution. That does not automatically prevent a paid Aurora application. No license for Aurora's original code has been selected.

Sources:

- https://developers.google.com/workspace/gmail/api/auth/scopes
- https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification
- https://partner.steamgames.com/doc/features/cloud
- https://partner.steamgames.com/steamdirect/
- https://raw.githubusercontent.com/DavidHDev/react-bits/main/LICENSE.md

## Recommended next action

Ask Valve whether Aurora's actual calendar/alarms feature set is eligible. If accepted, scope the first edition around local calendar, imports and alarms; separately decide the OAuth and authorized-sports-link approach. No Steam fee, agreement, account registration, upload or submission was performed as part of this assessment.
