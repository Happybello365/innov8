# Mobile minimum version

Set `EXPO_PUBLIC_UPDATE_CHECK_URL` to an HTTPS endpoint returning a JSON
manifest with `latestVersion`, optional `minimumVersion`, and optional
`iosStoreUrl` / `androidStoreUrl`. For example, publish latest version
`0.3.0` and minimum version `0.2.0` to require an upgrade from `0.1.0`.
Use two or three numeric version components. The minimum cannot exceed the
latest version. Use official Apple App Store or Google Play links.

The app checks at launch and on return to the foreground. An app below the
minimum displays an update and retry screen with the normal navigator
unavailable. If the store cannot open, that screen provides manual update
instructions. Builds at or above the minimum retain the optional update
banner. An unavailable or invalid manifest preserves the last successful
policy for the current session. A fresh session without a policy can start
normally after the five-second check timeout.

Publish the replacement builds before raising the minimum version.
