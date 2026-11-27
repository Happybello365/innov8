/**
 * Nigerian Pidgin (pcm) message catalog — covers nav + trade wizard strings.
 * Missing keys fall back to English automatically (see i18n/index.ts).
 */
const messages = {
  common: {
    loading: "E dey load…",
    retry: "Try again",
    cancel: "Cancel",
    confirm: "Confirm",
    save: "Save",
    continue: "Continue",
    back: "Go back",
    close: "Close",
    somethingWentWrong: "Something do mistake",
  },
  wallet: {
    connect: "Connect wallet",
    connecting: "E dey connect…",
    disconnect: "Disconnect",
    absentTitle: "Freighter no dey",
    absentBody: "Install Freighter browser extension make you connect your wallet.",
    absentCta: "Install Freighter",
    lockedTitle: "Freighter don lock",
    lockedBody: "Open Freighter extension and enter your password to continue.",
    lockedCta: "Unlock Freighter",
    rejectedTitle: "You reject the connection",
    rejectedBody: "You close the Freighter popup. Try again when you ready.",
    rejectedCta: "Try again",
    wrongNetworkTitle: "Wrong network",
    wrongNetworkBody: "Switch Freighter to {expected} to use innov8.",
    wrongNetworkCta: "Switch to {expected}",
    timeoutTitle: "Freighter no answer",
    timeoutBody: "The extension take too long. Reload and try again.",
    timeoutCta: "Try again",
  },
  trade: {
    createTitle: "Create trade",
    commodity: "Commodity",
    quantity: "Quantity",
    unit: "Unit",
    pricePerUnit: "Price per unit ({currency})",
    currency: "Currency",
    estimatedTotal: "Total estimate",
    sellerAddress: "Seller Stellar address",
    continueToNegotiation: "Continue to negotiation",
  },
} as const;

export default messages;
