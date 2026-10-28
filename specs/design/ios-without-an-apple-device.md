# iOS without an Apple device

Status: planned (not set up)
Date: 2026-10-23
Updated: 2026-10-28

- **Builds**: Capacitor's iOS project needs Xcode, so it has to be built on macOS. Without a Mac, use a macOS CI runner (e.g. GitHub Actions `macos` runners or Codemagic) that runs `npx cap sync ios`, builds and uploads to App Store Connect. Not set up yet; `ios/` does not exist until `npx cap add ios` is run on a Mac or in CI. Check the runners' current free quota and prices before relying on this.
- **Account**: an Apple Developer account ($99/year) is required for TestFlight and the App Store; enrolment works in the browser.
- **Testing**: an archer or coach with an iPhone tests through TestFlight and provides the App Store screenshots.
- **Sign-in**: an app in the App Store that offers Google sign-in must also offer Sign in with Apple, which is planned; no sign-in provider other than email and password exists yet ([hosting-backups-cost.md](hosting-backups-cost.md)).
- **Fallback**: the web app would be installable on iPhones from Safari ("Add to Home Screen") and work like an app. That needs a public web app, which is not planned for now ([stack.md](stack.md)), and the video conversion is a native Android plugin, so a browser build cannot convert clips. Not tested.
- **Order**: Android only at first (mobile app only, no public web app), Android is testable on your own devices; the iOS store app follows once an iPhone tester is available. Since it is one codebase, iOS needs no extra development, only testing and the store listing.
