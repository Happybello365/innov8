/* eslint-disable no-undef, @typescript-eslint/no-explicit-any */
// Issue #523: screen readers traverse the tree in document order. The offline
// banner must announce its headline, then its message, then each queued action
// with its status, and a failed action's Retry must follow its own status.
import React from 'react';
import { render } from '@testing-library/react-native';
import { OfflineBanner } from './OfflineBanner';
import type { QueuedAction } from '../stores/offlineQueueStore';

type Announcement = { text?: string; label?: string; role?: string };

// Flatten the host tree into the ordered list of spoken-text-bearing nodes.
function readingOrder(node: any, out: Announcement[] = []): Announcement[] {
  if (node == null || typeof node === 'string') {
    if (typeof node === 'string' && node.trim()) out.push({ text: node.trim() });
    return out;
  }
  const props = node.props ?? {};
  if (props.accessibilityLabel || props.accessibilityRole === 'button') {
    out.push({ label: props.accessibilityLabel, role: props.accessibilityRole });
  }
  const children = Array.isArray(node.children) ? node.children : [];
  for (const child of children) readingOrder(child, out);
  return out;
}

const actions: QueuedAction[] = [
  { id: 'q-a', label: 'Create trade A', status: 'failed', error: 'Lot unavailable', attempts: 1 },
  { id: 'q-b', label: 'Approve release B', status: 'pending', attempts: 0 },
];

describe('OfflineBanner screen-reader order (#523)', () => {
  it('announces the headline before the message', () => {
    const tree = render(<OfflineBanner />).toJSON() as any;
    const spoken = readingOrder(tree).map((a) => a.text).filter(Boolean);
    const headlineIdx = spoken.indexOf('No connection');
    const bodyIdx = spoken.findIndex((t) => t?.startsWith("You're offline."));
    expect(headlineIdx).toBeGreaterThanOrEqual(0);
    expect(bodyIdx).toBeGreaterThan(headlineIdx);
  });

  it('announces queued actions in the order they were queued', () => {
    const tree = render(<OfflineBanner queuedActions={actions} />).toJSON() as any;
    const labels = readingOrder(tree)
      .map((a) => a.label)
      .filter((l): l is string => !!l);
    const aIdx = labels.indexOf('Create trade A: Failed');
    const bIdx = labels.indexOf('Approve release B: Pending');
    expect(aIdx).toBeGreaterThanOrEqual(0);
    expect(bIdx).toBeGreaterThan(aIdx);
  });

  it('places a failed action Retry button after its own status, not before', () => {
    const tree = render(<OfflineBanner queuedActions={actions} />).toJSON() as any;
    const labels = readingOrder(tree).map((a) => a.label).filter((l): l is string => !!l);
    const statusIdx = labels.indexOf('Create trade A: Failed');
    const retryIdx = labels.indexOf('Retry Create trade A');
    expect(retryIdx).toBeGreaterThan(statusIdx);
    // The retry control belongs to the failed row only: no retry for pending items.
    expect(labels).not.toContain('Retry Approve release B');
  });

  it('gives the Retry control the button role so it is announced as actionable', () => {
    const { getByLabelText } = render(<OfflineBanner queuedActions={actions} />);
    const retry = getByLabelText('Retry Create trade A');
    expect(retry.props.accessibilityRole).toBe('button');
  });

  it('keeps the banner as a polite alert region so the update is announced once', () => {
    const { getByTestId } = render(<OfflineBanner queuedActions={actions} />);
    const banner = getByTestId('offline-banner');
    expect(banner.props.accessibilityRole).toBe('alert');
    expect(banner.props.accessibilityLiveRegion).toBe('polite');
  });
});
