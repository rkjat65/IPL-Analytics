# Crickrida store submission pack

Prepared: 15 July 2026

## App identity

- App name: `Crickrida`
- Bundle ID / package name: `in.rkjat.crickrida`
- Version: `1.0.0`
- Build number / version code: `1`
- Primary category: Sports
- Secondary App Store category: Entertainment
- Default language: English (India)
- Age rating: Complete the store questionnaires truthfully; the app itself contains no gambling, ads, or user-to-user communication.
- Copyright: `2026 Crickrida` (replace with the enrolled legal owner name if required by the store account)
- Contact: `rkdevanda65@gmail.com`

## URLs

- Marketing URL: https://crickrida.com
- Support URL: https://crickrida.com/faq
- Privacy policy: https://crickrida.com/privacy
- Terms: https://crickrida.com/terms
- Account deletion: https://crickrida.com/account-deletion

These public legal routes and the in-app account deletion control must be deployed before the listing is submitted.

## App Store copy

### Subtitle (26/30 characters)

`IPL Stats, Insights & AI`

### Promotional text

Explore every IPL season with fast filters, deep player and team insights, AI-assisted cricket questions, and polished cards ready to share.

### Keywords

`IPL,cricket,statistics,analytics,players,teams,matches,records,scores,AI,sports`

### Description

Crickrida turns IPL history into a fast, visual analytics experience.

Explore every season, compare teams and players, find records, inspect match and venue trends, and turn the numbers into shareable cricket cards. The built-in AI Studio can answer questions grounded in Crickrida's IPL dataset when you sign in.

FEATURES

- Complete IPL overview across seasons
- Player, team, match, venue, and record leaderboards
- Fast season and team filters
- AI-assisted cricket analysis for registered users
- Custom shareable stat cards
- Secure sign-in and in-app account deletion
- Dark, high-contrast interface designed for mobile

Crickrida is an independent cricket analytics product. It is not affiliated with, endorsed by, or sponsored by the IPL, BCCI, any franchise, or any player.

### App Review notes

Most analytics are available without an account. Registration is needed only for personalized AI Studio usage. Reviewers can create a new account in the app; no invitation or payment is required. Account deletion is available under More > Account > Delete account. The app requests photo-library permission only when the user chooses to save a generated card. There are no ads, subscriptions, purchases, tracking SDKs, or gambling features.

## Google Play copy

### Short description (75/80 characters)

`Explore IPL history with deep stats, AI insights and shareable cards.`

### Full description

Crickrida puts IPL history in your pocket.

Move quickly from the big picture to the detail: explore every season, compare teams and players, find leaders and records, inspect match and venue trends, and create polished cricket cards to share.

What you can do:

- Explore IPL seasons through a fast visual dashboard
- Browse player, team, match, venue, and record analytics
- Filter results by season and team
- Ask data-grounded questions in AI Studio after signing in
- Build and share custom stat cards
- Delete your account and associated personal data from inside the app

Most analytics work without an account. Crickrida has no ads, subscriptions, in-app purchases, or gambling features.

Crickrida is an independent cricket analytics product. It is not affiliated with, endorsed by, or sponsored by the IPL, BCCI, any franchise, or any player.

## Privacy declarations

Use these as the source for the App Privacy and Data safety forms, then verify them against the production backend before answering the console questionnaire.

| Data | Collected | Linked to user | Purpose | Shared / tracking |
|---|---:|---:|---|---|
| Name | Registration only | Yes | Account management | No |
| Email address | Registration/sign-in | Yes | Authentication and account management | No |
| User ID | Signed-in use | Yes | Authentication and feature quotas | No |
| AI question text | AI Studio only | Yes | App functionality | Sent to the configured AI processing provider; not used for ads |
| Product interaction / usage count | Signed-in feature use | Yes | Feature quotas and app functionality | No |

- Data is encrypted in transit with HTTPS.
- Authentication tokens are stored in OS-protected secure storage.
- No advertising identifier, precise location, contacts, financial information, health data, or diagnostics SDK is collected by the app.
- No cross-app tracking or sale of personal data.
- Account deletion is available in the app and through the public deletion page.

## Asset inventory

| Store asset | Required size | File |
|---|---:|---|
| App Store icon | 1024 x 1024 PNG, no alpha | `app_store/app-icon-1024.png` |
| Google Play icon | 512 x 512 PNG | `google_play/app-icon-512.png` |
| Google Play feature graphic | 1024 x 500 PNG, no alpha | `google_play/feature-graphic-1024x500.png` |
| Shared logo | 512 x 512 PNG | `shared/crickrida-logo-512.png` |
| Shared wordmark | 1600 x 400 PNG | `shared/crickrida-wordmark.png` |
| Apple phone screenshots | 1320 x 2868 PNG | `app_store/screenshots/` |
| Google phone screenshots | 1080 x 1920 PNG | `google_play/screenshots/` |
| Android upload certificate | PEM | `google_play/upload-certificate.pem` |

## Release outputs

- Google Play Android App Bundle: `build/app/outputs/bundle/release/app-release.aab`
- Optional Android APK for direct testing: `build/app/outputs/flutter-apk/app-release.apk`
- App Store IPA: `build/ios/ipa/crickrida.ipa`
- Xcode archive: `build/ios/archive/Runner.xcarchive`

The Android private upload keystore and its passwords are intentionally excluded from Git. Back up `android/upload-keystore.jks` and `android/key.properties` together in a password manager or encrypted vault. Losing the upload key complicates future updates.

## Final console checklist

- Enrol in Apple Developer Program and Google Play Console, accept current agreements, and complete banking/tax details if requested.
- Create the app records using the exact package identifiers above.
- Upload the AAB to a Play internal-testing track and the IPA through Transporter/Xcode, then resolve any console-only validation warnings.
- Upload the store copy, icon, feature graphic, and screenshots in this directory.
- Complete App Privacy, Data safety, content rating, target audience, ads, and government-app declarations using the verified privacy table above.
- Add the privacy and account-deletion URLs, then confirm both are publicly reachable without signing in.
- Configure the production `SMTP_*` environment variables so password-reset links can be delivered; never enable `EXPOSE_RESET_TOKEN` in production.
- Provide App Review with a test account only if account creation is unavailable during review; otherwise use the review note above.
- Confirm the legal contact, copyright name, privacy answers, AI-provider disclosure, and rights to any cricket statistics or media before pressing Submit.
