import {
  ALLOWED_LINK_HOSTS,
  LINK_PREFIXES,
  deepLinkRejectionReason,
  isAllowedDeepLink,
  parseDeepLink,
  requiresAuth,
  webUrlFor,
} from '../links';

describe('parseDeepLink', () => {
  it('parses a universal link to a trade', () => {
    expect(parseDeepLink('https://amanavault.app/trades/T-123')).toEqual({
      screen: 'TradeDetail',
      params: { tradeId: 'T-123' },
    });
  });

  it('parses a custom-scheme link to a trade (cold start payload)', () => {
    expect(parseDeepLink('amanavault://trades/T-123')).toEqual({
      screen: 'TradeDetail',
      params: { tradeId: 'T-123' },
    });
  });

  it('parses a bare path (warm start / notification data)', () => {
    expect(parseDeepLink('/disputes/D9')).toEqual({
      screen: 'DisputeDetail',
      params: { id: 'D9' },
    });
  });

  it('parses the trade list with no params', () => {
    expect(parseDeepLink('https://amanavault.app/trades')).toEqual({ screen: 'TradeList' });
  });

  it('parses an evidence-capture universal link', () => {
    expect(parseDeepLink('https://amanavault.app/trades/T1/evidence')).toEqual({
      screen: 'EvidenceCapture',
      params: { tradeId: 'T1' },
    });
  });

  it('returns null for malformed / unknown links', () => {
    expect(parseDeepLink('https://amanavault.app/nope/here')).toBeNull();
    expect(parseDeepLink('not a url')).toBeNull();
    expect(parseDeepLink('')).toBeNull();
    expect(parseDeepLink(null)).toBeNull();
  });

  it('treats a trailing-slash trades path as the list', () => {
    expect(parseDeepLink('amanavault://trades/')).toEqual({ screen: 'TradeList' });
  });

  it('round-trips to a public web URL', () => {
    const target = parseDeepLink('amanavault://trades/T-123')!;
    expect(webUrlFor(target)).toBe('https://amanavault.app/trades/T-123');
  });

  it('flags auth requirement per screen', () => {
    expect(requiresAuth({ screen: 'TradeDetail' })).toBe(true);
    expect(requiresAuth({ screen: 'WalletConnect' })).toBe(false);
  });
});

describe('deep-link allowlist (issue #534)', () => {
  it('accepts the custom scheme, allowed https hosts and bare paths', () => {
    expect(isAllowedDeepLink('amanavault://trades/T1')).toBe(true);
    expect(isAllowedDeepLink('https://amanavault.app/trades/T1')).toBe(true);
    expect(isAllowedDeepLink('https://www.amanavault.app/trades/T1')).toBe(true);
    expect(isAllowedDeepLink('https://AMANAVAULT.app/trades/T1')).toBe(true);
    expect(isAllowedDeepLink('/trades/T1')).toBe(true);
  });

  it.each([
    ['https://evil.example/trades/T1', 'host'],
    ['https://amanavault.app.evil.example/trades/T1', 'host'],
    ['https://evilamanavault.app/trades/T1', 'host'],
    ['//evil.example/trades/T1', 'host'],
    ['http://amanavault.app/trades/T1', 'scheme'],
    ['javascript:alert(1)', 'scheme'],
    ['file:///etc/passwd', 'scheme'],
    ['intent://trades/T1#Intent;scheme=amanavault;end', 'scheme'],
    ['otherapp://trades/T1', 'scheme'],
    ['https://user:pass@amanavault.app/trades/T1', 'credentials'],
    ['https://amanavault.app:8443/trades/T1', 'port'],
    ['https://amanavault.app/trades/T1\n', 'malformed'],
    ['https://amanavault.app\\@evil.example/trades/T1', 'malformed'],
    ['', 'empty'],
    [null, 'empty'],
  ])('rejects %p (%s)', (input, reason) => {
    expect(deepLinkRejectionReason(input as string | null)).toBe(reason);
    expect(parseDeepLink(input as string | null)).toBeNull();
  });

  it('never routes an unrelated host even when the path matches a screen', () => {
    expect(parseDeepLink('https://phish.example/disputes/D1')).toBeNull();
    expect(parseDeepLink('https://phish.example/trades')).toBeNull();
  });

  it('rejects ids that smuggle another resource via encoding', () => {
    expect(parseDeepLink('https://amanavault.app/trades/..%2Fadmin')).toBeNull();
    expect(parseDeepLink('https://amanavault.app/trades/a%5Cb')).toBeNull();
    expect(parseDeepLink('https://amanavault.app/trades/%2E%2E')).toBeNull();
    expect(parseDeepLink('https://amanavault.app/trades/%E0%A4%A')).toBeNull();
    expect(parseDeepLink(`https://amanavault.app/trades/${'x'.repeat(129)}`)).toBeNull();
  });

  it('keeps LINK_PREFIXES in step with the host allowlist', () => {
    expect(LINK_PREFIXES).toEqual([
      'amanavault://',
      ...ALLOWED_LINK_HOSTS.map((h) => `https://${h}`),
    ]);
  });
});
