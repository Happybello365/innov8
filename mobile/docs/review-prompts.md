# Mobile review prompts

Set `EXPO_PUBLIC_REVIEW_PROMPT_ENABLED=true` and configure
`EXPO_PUBLIC_REVIEW_IOS_STORE_URL` and `EXPO_PUBLIC_REVIEW_ANDROID_STORE_URL`
in the Expo build environment. Each platform requires its own store URL.

A trade counts when a list or detail refresh first observes it change from
Funded, In Transit, or Delivered to server-confirmed Completed. The app asks
after two completions, waits at
least 120 days between prompts, and allows at most three prompts in 365 days.
A dispute or failed delivery, deposit, or release pauses prompts for 30 days.
Users can opt out on the device. The device stores counts and timestamps.
