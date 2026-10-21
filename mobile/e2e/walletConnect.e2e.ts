/* eslint-disable no-undef */
/**
 * WalletConnect E2E suite — Amana Mobile (#264)
 *
 * Covers the wallet connection flow that most other flows depend on:
 *   1. Successful connection → challenge/verify succeed → lands on TradeList
 *   2. Rejected connection   → verify returns 401 → error alert, stays on WalletConnect
 *   3. Invalid address       → rejected client-side before any network call
 *
 * The screen collects the address through a native Alert.prompt, so the
 * text-entry steps target the system alert's text field.
 */

import { device, element, by, expect as detoxExpect, waitFor } from 'detox';
import { MOCK_WALLET_ADDRESS } from './helpers/auth';
import {
  REJECTED_WALLET_ADDRESS,
  startMockServer,
  stopMockServer,
} from './helpers/mockServer';

const TIMEOUT = 15_000; // ms — generous for emulator cold-start

const unauthenticatedLaunchArgs = {
  E2E_API_BASE_URL: 'http://localhost:4001',
  E2E_MODE: 'true',
  // No E2E_MOCK_JWT — the navigator starts at WalletConnect.
};

// Alert.prompt is iOS-only; on Android the screen has no address entry yet.
const describeOnIOS = (process.env.DETOX_CONFIGURATION ?? 'ios').startsWith('ios')
  ? describe
  : describe.skip;

let ownsMockServer = false;

async function launchSignedOut(): Promise<void> {
  await device.launchApp({
    newInstance: true,
    delete: true,
    launchArgs: unauthenticatedLaunchArgs,
  });
  await waitFor(element(by.id('connect-wallet-button')))
    .toBeVisible()
    .withTimeout(TIMEOUT);
}

/** Opens the address prompt, types the address and confirms. */
async function submitWalletAddress(address: string): Promise<void> {
  await element(by.id('connect-wallet-button')).tap();
  await waitFor(element(by.text('Enter Wallet Address')))
    .toBeVisible()
    .withTimeout(TIMEOUT);
  await element(by.type('_UIAlertControllerTextField')).typeText(address);
  await element(by.label('OK')).atIndex(0).tap();
}

beforeAll(async () => {
  try {
    await startMockServer();
    ownsMockServer = true;
  } catch {
    // Already started by another suite / globalSetup on the same port.
  }
  if (device.getPlatform() === 'android') {
    // Route the emulator's localhost:4001 to the host mock server.
    await device.reverseTCPPort(4001);
  }
});

afterAll(async () => {
  if (ownsMockServer) {
    await stopMockServer();
  }
  await device.terminateApp();
});

describeOnIOS('WalletConnect flow', () => {
  beforeEach(async () => {
    await launchSignedOut();
  });

  it('connects a wallet and navigates to the trade list', async () => {
    await submitWalletAddress(MOCK_WALLET_ADDRESS);

    await waitFor(element(by.text('🌾 Trades')))
      .toBeVisible()
      .withTimeout(TIMEOUT);
    await detoxExpect(element(by.id('connect-wallet-button'))).not.toExist();
  });

  it('shows an error and stays on WalletConnect when the connection is rejected', async () => {
    await submitWalletAddress(REJECTED_WALLET_ADDRESS);

    await waitFor(element(by.text('Connection failed')))
      .toBeVisible()
      .withTimeout(TIMEOUT);
    await element(by.label('OK')).atIndex(0).tap();

    await detoxExpect(element(by.id('connect-wallet-button'))).toBeVisible();
    await detoxExpect(element(by.text('🌾 Trades'))).not.toExist();
  });

  it('rejects a malformed address before contacting the server', async () => {
    await submitWalletAddress('not-a-stellar-key');

    await waitFor(element(by.text('Invalid address')))
      .toBeVisible()
      .withTimeout(TIMEOUT);
    await element(by.label('OK')).atIndex(0).tap();

    await detoxExpect(element(by.id('connect-wallet-button'))).toBeVisible();
  });
});
