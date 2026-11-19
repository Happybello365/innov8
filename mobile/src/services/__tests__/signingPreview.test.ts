import {
  Account,
  Asset,
  Keypair,
  Networks,
  Operation,
  StrKey,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import {
  SigningPreviewError,
  buildSigningPreview,
  formatSigningPreviewMessage,
  formatStroops,
} from '../signingPreview';

const source = Keypair.random();
const payee = Keypair.random().publicKey();
const payeeTwo = Keypair.random().publicKey();
const contractId = StrKey.encodeContract(Buffer.alloc(32, 7));

function buildXdr(ops: Array<(b: TransactionBuilder) => void>, passphrase = Networks.TESTNET): string {
  const account = new Account(source.publicKey(), '1');
  const builder = new TransactionBuilder(account, { fee: '100', networkPassphrase: passphrase });
  ops.forEach((add) => add(builder));
  return builder.setTimeout(30).build().toXDR();
}

describe('formatStroops', () => {
  it('renders whole and fractional amounts without trailing zeros', () => {
    expect(formatStroops(15_000_000n)).toBe('1.5');
    expect(formatStroops(10_000_000n)).toBe('1');
    expect(formatStroops(12_345_678n)).toBe('1.2345678');
    expect(formatStroops(0n)).toBe('0');
  });
});

describe('buildSigningPreview', () => {
  it('lists payment operations with their amounts and destinations', () => {
    const xdr = buildXdr([
      (b) => b.addOperation(Operation.payment({ destination: payee, asset: Asset.native(), amount: '10' })),
    ]);

    const preview = buildSigningPreview(xdr, Networks.TESTNET);

    expect(preview.operations).toEqual([
      { index: 0, type: 'payment', description: `Pay 10.0000000 XLM to ${payee}` },
    ]);
  });

  it('sums final party amounts per destination and asset', () => {
    const xdr = buildXdr([
      (b) => b.addOperation(Operation.payment({ destination: payee, asset: Asset.native(), amount: '2.5' })),
      (b) => b.addOperation(Operation.payment({ destination: payee, asset: Asset.native(), amount: '1.25' })),
      (b) => b.addOperation(Operation.payment({ destination: payeeTwo, asset: Asset.native(), amount: '4' })),
    ]);

    const preview = buildSigningPreview(xdr, Networks.TESTNET);

    expect(preview.partyTotals).toEqual([
      { party: payee, asset: 'XLM', amount: '3.75' },
      { party: payeeTwo, asset: 'XLM', amount: '4' },
    ]);
  });

  it('describes contract invocations by function name', () => {
    const xdr = buildXdr([
      (b) =>
        b.addOperation(
          Operation.invokeContractFunction({ contract: contractId, function: 'add_mediator', args: [] }),
        ),
    ]);

    const preview = buildSigningPreview(xdr, Networks.TESTNET);

    expect(preview.operations[0]).toEqual({
      index: 0,
      type: 'invokeHostFunction',
      description: 'Contract call: add_mediator',
    });
    expect(preview.partyTotals).toEqual([]);
  });

  it('throws a SigningPreviewError for malformed XDR (fails closed)', () => {
    expect(() => buildSigningPreview('not-a-real-xdr', Networks.TESTNET)).toThrow(SigningPreviewError);
  });
});

describe('formatSigningPreviewMessage', () => {
  it('lists operations and final party amounts', () => {
    const message = formatSigningPreviewMessage({
      operations: [{ index: 0, type: 'payment', description: 'Pay 2 XLM to GABC' }],
      partyTotals: [{ party: 'GABC', asset: 'XLM', amount: '2' }],
    });

    expect(message).toBe('Operations:\n1. Pay 2 XLM to GABC\n\nFinal amounts:\nGABC: 2 XLM');
  });

  it('omits the amounts section when there are no payments', () => {
    const message = formatSigningPreviewMessage({
      operations: [{ index: 0, type: 'invokeHostFunction', description: 'Contract call: add_mediator' }],
      partyTotals: [],
    });

    expect(message).toBe('Operations:\n1. Contract call: add_mediator');
  });
});
