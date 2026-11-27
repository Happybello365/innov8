import { act, renderHook } from "@testing-library/react";
import { usePrefersReducedMotion } from "../usePrefersReducedMotion";

type Listener = (event: { matches: boolean }) => void;

function mockMatchMedia(initial: boolean) {
  let matches = initial;
  const listeners = new Set<Listener>();
  const mql = {
    get matches() {
      return matches;
    },
    media: "(prefers-reduced-motion: reduce)",
    addEventListener: (_: string, l: Listener) => listeners.add(l),
    removeEventListener: (_: string, l: Listener) => listeners.delete(l),
  };
  window.matchMedia = jest.fn().mockReturnValue(mql) as unknown as typeof window.matchMedia;
  return {
    change(next: boolean) {
      matches = next;
      listeners.forEach((l) => l({ matches: next }));
    },
    listenerCount: () => listeners.size,
  };
}

describe("usePrefersReducedMotion", () => {
  it("returns true when the user prefers reduced motion", () => {
    mockMatchMedia(true);
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(true);
  });

  it("returns false when the user has no preference", () => {
    mockMatchMedia(false);
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(false);
  });

  it("updates live when the preference changes and cleans up its listener", () => {
    const media = mockMatchMedia(false);
    const { result, unmount } = renderHook(() => usePrefersReducedMotion());

    act(() => media.change(true));
    expect(result.current).toBe(true);

    unmount();
    expect(media.listenerCount()).toBe(0);
  });
});
