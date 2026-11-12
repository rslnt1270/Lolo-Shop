import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { SavedCheck } from "../products/SavedCheck";

describe("SavedCheck", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("se mantiene 1.4 s y luego se retira, con o sin reducir movimiento", () => {
    vi.useFakeTimers();
    render(<SavedCheck />);
    expect(screen.getByTestId("saved-check")).toBeInTheDocument();
    act(() => void vi.advanceTimersByTime(1399));
    expect(screen.getByTestId("saved-check")).toBeInTheDocument();
    act(() => void vi.advanceTimersByTime(2));
    expect(screen.queryByTestId("saved-check")).toBeNull();
  });
});
