import React from "react";
import { render, screen } from "@testing-library/react";
import { SideNavBar } from "../SideNavBar";

describe("SideNavBar — Role-Aware Navigation (#495)", () => {
  const defaultProps = {
    activePath: "/dashboard",
    isConnected: true,
    onConnectWallet: jest.fn(),
    walletAddress: "GABC1234567890XYZ",
  };

  it("hides the Admin navigation link when isAdmin is false", () => {
    render(<SideNavBar {...defaultProps} isAdmin={false} />);

    expect(screen.queryByRole("link", { name: /admin/i })).not.toBeInTheDocument();
  });

  it("displays the Admin navigation link when isAdmin is true", () => {
    render(<SideNavBar {...defaultProps} isAdmin={true} />);

    const adminLink = screen.getByRole("link", { name: /admin/i });
    expect(adminLink).toBeInTheDocument();
    expect(adminLink).toHaveAttribute("href", "/admin/dashboard");
  });
});
