import { renderHook, act } from '@testing-library/react';
import { TradeProvider, useTrade } from '../TradeContext';

describe('TradeContext', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
        <TradeProvider>{children}</TradeProvider>
    );

    describe('initialization', () => {
        it('should initialize with default values', () => {
            const { result } = renderHook(() => useTrade(), { wrapper });

            expect(result.current.step).toBe(1);
            expect(result.current.data).toEqual({
                commodity: '',
                quantity: '',
                unit: 'kg',
                pricePerUnit: '',
                currency: 'NGN',
                sellerAddress: '',
                buyerRatio: 50,
                sellerRatio: 50,
                deliveryDays: '7',
                notes: '',
            });
        });

        it('should provide setStep function', () => {
            const { result } = renderHook(() => useTrade(), { wrapper });

            expect(typeof result.current.setStep).toBe('function');
        });

        it('should provide update function', () => {
            const { result } = renderHook(() => useTrade(), { wrapper });

            expect(typeof result.current.update).toBe('function');
        });
    });

    describe('step progression', () => {
        it('should update step to 2', () => {
            const { result } = renderHook(() => useTrade(), { wrapper });

            act(() => {
                result.current.setStep(2);
            });

            expect(result.current.step).toBe(2);
        });

        it('should update step to 3', () => {
            const { result } = renderHook(() => useTrade(), { wrapper });

            act(() => {
                result.current.setStep(3);
            });

            expect(result.current.step).toBe(3);
        });

        it('should allow going back to previous steps', () => {
            const { result } = renderHook(() => useTrade(), { wrapper });

            act(() => {
                result.current.setStep(3);
            });
            expect(result.current.step).toBe(3);

            act(() => {
                result.current.setStep(1);
            });
            expect(result.current.step).toBe(1);
        });
    });

    describe('update function', () => {
        it('should update single field', () => {
            const { result } = renderHook(() => useTrade(), { wrapper });

            act(() => {
                result.current.update({ commodity: 'Maize' });
            });

            expect(result.current.data.commodity).toBe('Maize');
            expect(result.current.data.quantity).toBe('');
        });

        it('should update multiple fields at once', () => {
            const { result } = renderHook(() => useTrade(), { wrapper });

            act(() => {
                result.current.update({
                    commodity: 'Rice',
                    quantity: '500',
                    pricePerUnit: '450',
                });
            });

            expect(result.current.data.commodity).toBe('Rice');
            expect(result.current.data.quantity).toBe('500');
            expect(result.current.data.pricePerUnit).toBe('450');
        });

        it('should preserve existing fields when updating', () => {
            const { result } = renderHook(() => useTrade(), { wrapper });

            act(() => {
                result.current.update({ commodity: 'Maize' });
            });

            act(() => {
                result.current.update({ quantity: '100' });
            });

            expect(result.current.data.commodity).toBe('Maize');
            expect(result.current.data.quantity).toBe('100');
        });

        it('should update buyerRatio and sellerRatio independently', () => {
            const { result } = renderHook(() => useTrade(), { wrapper });

            act(() => {
                result.current.update({ buyerRatio: 70 });
            });

            expect(result.current.data.buyerRatio).toBe(70);
            expect(result.current.data.sellerRatio).toBe(50);
        });

        it('should update sellerAddress', () => {
            const { result } = renderHook(() => useTrade(), { wrapper });

            act(() => {
                result.current.update({ sellerAddress: 'GABCDEFGHIJKLMNOPQRSTUVWXYZ012345678901234567890' });
            });

            expect(result.current.data.sellerAddress).toBe('GABCDEFGHIJKLMNOPQRSTUVWXYZ012345678901234567890');
        });

        it('should update deliveryDays', () => {
            const { result } = renderHook(() => useTrade(), { wrapper });

            act(() => {
                result.current.update({ deliveryDays: '14' });
            });

            expect(result.current.data.deliveryDays).toBe('14');
        });

        it('should update notes', () => {
            const { result } = renderHook(() => useTrade(), { wrapper });

            act(() => {
                result.current.update({ notes: 'Goods must be bagged and sealed' });
            });

            expect(result.current.data.notes).toBe('Goods must be bagged and sealed');
        });

        it('should update currency', () => {
            const { result } = renderHook(() => useTrade(), { wrapper });

            act(() => {
                result.current.update({ currency: 'cNGN' });
            });

            expect(result.current.data.currency).toBe('cNGN');
        });

        it('should update unit', () => {
            const { result } = renderHook(() => useTrade(), { wrapper });

            act(() => {
                result.current.update({ unit: 'tonnes' });
            });

            expect(result.current.data.unit).toBe('tonnes');
        });
    });

    describe('edge cases', () => {
        it('should handle empty string updates', () => {
            const { result } = renderHook(() => useTrade(), { wrapper });

            act(() => {
                result.current.update({ commodity: 'Maize' });
            });

            act(() => {
                result.current.update({ commodity: '' });
            });

            expect(result.current.data.commodity).toBe('');
        });

        it('should handle null-like values in strings', () => {
            const { result } = renderHook(() => useTrade(), { wrapper });

            act(() => {
                result.current.update({ quantity: '0' });
            });

            expect(result.current.data.quantity).toBe('0');
        });

        it('should handle very large numbers as strings', () => {
            const { result } = renderHook(() => useTrade(), { wrapper });

            act(() => {
                result.current.update({ quantity: '999999999' });
            });

            expect(result.current.data.quantity).toBe('999999999');
        });

        it('should handle negative numbers as strings', () => {
            const { result } = renderHook(() => useTrade(), { wrapper });

            act(() => {
                result.current.update({ quantity: '-100' });
            });

            expect(result.current.data.quantity).toBe('-100');
        });

        it('should handle boundary values for ratios', () => {
            const { result } = renderHook(() => useTrade(), { wrapper });

            act(() => {
                result.current.update({ buyerRatio: 0 });
            });
            expect(result.current.data.buyerRatio).toBe(0);

            act(() => {
                result.current.update({ buyerRatio: 100 });
            });
            expect(result.current.data.buyerRatio).toBe(100);
        });
    });
});

describe('TradeContext draft recovery & conflicts', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
        <TradeProvider>{children}</TradeProvider>
    );
    beforeEach(() => localStorage.clear());

    it('restores a saved draft and exposes recovery timestamp', () => {
        const savedAt = new Date().toISOString();
        localStorage.setItem('amana:draft-trade', JSON.stringify({ version: 1, tabId: 'other', savedAt, step: 2, data: { commodity: 'Rice' } }));
        const { result } = renderHook(() => useTrade(), { wrapper });
        expect(result.current.data.commodity).toBe('Rice');
        expect(result.current.step).toBe(2);
        expect(result.current.recoveredDraftAt).toBe(savedAt);
    });

    it('discardDraft resets the wizard and clears storage', () => {
        localStorage.setItem('amana:draft-trade', JSON.stringify({ version: 1, tabId: 'other', savedAt: new Date().toISOString(), step: 2, data: { commodity: 'Rice' } }));
        const { result } = renderHook(() => useTrade(), { wrapper });
        act(() => result.current.discardDraft());
        expect(result.current.data.commodity).toBe('');
        expect(result.current.step).toBe(1);
        expect(result.current.recoveredDraftAt).toBeNull();
        expect(localStorage.getItem('amana:draft-trade')).toBeNull();
    });

    it('raises a conflict when another tab saves a newer draft and resolves it', () => {
        const { result } = renderHook(() => useTrade(), { wrapper });
        act(() => result.current.update({ commodity: 'Maize' }));
        const incoming = JSON.stringify({ version: 1, tabId: 'other-tab', savedAt: new Date(Date.now() + 5000).toISOString(), step: 1, data: { commodity: 'Sorghum' } });
        act(() => {
            window.dispatchEvent(new StorageEvent('storage', { key: 'amana:draft-trade', newValue: incoming }));
        });
        expect(result.current.conflict?.incoming.data.commodity).toBe('Sorghum');
        act(() => result.current.acceptIncomingDraft());
        expect(result.current.conflict).toBeNull();
        expect(result.current.data.commodity).toBe('Sorghum');
    });

    it('keepLocalDraft retains local edits and overwrites storage', () => {
        const { result } = renderHook(() => useTrade(), { wrapper });
        act(() => result.current.update({ commodity: 'Maize' }));
        const incoming = JSON.stringify({ version: 1, tabId: 'other-tab', savedAt: new Date(Date.now() + 5000).toISOString(), step: 1, data: { commodity: 'Sorghum' } });
        act(() => {
            window.dispatchEvent(new StorageEvent('storage', { key: 'amana:draft-trade', newValue: incoming }));
        });
        act(() => result.current.keepLocalDraft());
        expect(result.current.conflict).toBeNull();
        expect(result.current.data.commodity).toBe('Maize');
        expect(JSON.parse(localStorage.getItem('amana:draft-trade')!).data.commodity).toBe('Maize');
    });
});
