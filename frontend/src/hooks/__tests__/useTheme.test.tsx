import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ThemeProvider } from "../useTheme";
import { ThemeToggle } from "@/components/ThemeToggle";

describe("theme preference", () => {
  const originalMatchMedia = window.matchMedia;
  let systemPreference = true;
  const changeListeners = new Set<(event: MediaQueryListEvent) => void>();

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("light", "dark", "theme-transition");
    systemPreference = true;
    changeListeners.clear();
    window.matchMedia = jest.fn().mockImplementation(() => ({
      matches: systemPreference,
      media: "(prefers-color-scheme: dark)",
      onchange: null,
      addEventListener: (_: string, listener: EventListenerOrEventListenerObject) => {
        if (typeof listener === "function") {
          changeListeners.add(listener as (event: MediaQueryListEvent) => void);
        }
      },
      removeEventListener: (_: string, listener: EventListenerOrEventListenerObject) => {
        if (typeof listener === "function") {
          changeListeners.delete(listener as (event: MediaQueryListEvent) => void);
        }
      },
      addListener: jest.fn(),
      removeListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })) as typeof window.matchMedia;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
    window.matchMedia = originalMatchMedia;
  });

  function renderThemeToggle() {
    return render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>
    );
  }

  it("follows the system preference by default and responds to system changes", async () => {
    systemPreference = true;
    renderThemeToggle();

    await waitFor(() => expect(document.documentElement).toHaveClass("dark"));
    expect(screen.getByRole("radio", { name: "System" })).toHaveAttribute("aria-checked", "true");

    systemPreference = false;
    act(() => {
      for (const listener of changeListeners) {
        listener({ matches: false } as MediaQueryListEvent);
      }
    });
    await waitFor(() => expect(document.documentElement).toHaveClass("light"));
  });

  it("persists a manually selected theme and restores it on the next visit", async () => {
    const { unmount } = renderThemeToggle();
    fireEvent.click(screen.getByRole("radio", { name: "Light" }));

    await waitFor(() => expect(document.documentElement).toHaveClass("light"));
    expect(localStorage.getItem("amana-theme-preference")).toBe("light");
    unmount();

    renderThemeToggle();
    await waitFor(() => expect(screen.getByRole("radio", { name: "Light" })).toHaveAttribute("aria-checked", "true"));
    expect(document.documentElement).toHaveClass("light");
  });

  it("ignores an invalid stored preference and falls back to the system", async () => {
    localStorage.setItem("amana-theme-preference", "sepia");
    systemPreference = false;
    renderThemeToggle();

    await waitFor(() => expect(document.documentElement).toHaveClass("light"));
    expect(screen.getByRole("radio", { name: "System" })).toHaveAttribute("aria-checked", "true");
  });
});
