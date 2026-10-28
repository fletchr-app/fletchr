# App: Vue 3 + Capacitor instead of Expo (React Native)

status: accepted
date: 2026-10-18

## Context and Problem Statement

The first version was written with Expo (React Native). The maintainer also maintains pyobs-web-client, which is Vue.

## Considered Options

- Expo / React Native (the old version).
- Vue 3 + TypeScript + Vite, wrapped for phones with Capacitor.

## Decision Outcome

Vue 3 + Capacitor (plan draft v5), so the stack matches pyobs-web-client and one person can maintain both. UI is Ionic Vue with Bootstrap utilities for layout only; charts are inline SVG so they render the same everywhere. The last Expo version is the git tag `expo-final`.

## Consequences

- The phone apps are the web app in a WebView plus Capacitor plugins, so anything native (video conversion, secure storage) needs a plugin; see [0003](0003-phone-converts-videos-before-upload.md).
- iOS needs macOS for builds, see [ios-without-an-apple-device.md](../design/ios-without-an-apple-device.md).

Details: [stack.md](../design/stack.md).
