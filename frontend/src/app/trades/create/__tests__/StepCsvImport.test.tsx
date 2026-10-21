import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import StepCsvImport from "../steps/StepCsvImport";
import type { TradeData } from "../TradeContext";

const VALID_ROW = "Maize,500,kg,450,NGN,GBRPYHIL2CI6PBSMWDTZPOWRFNKPYEF4RCFGSDCYWKRFMZTWSSCMXPST";
const INVALID_ROW = "BadCommodity,,kg,not-a-price,NGN,INVALID_KEY";

function makeFile(content: string) {
  return new File([content], "trades.csv", { type: "text/csv" });
}

describe("StepCsvImport", () => {
  it("renders the upload UI initially", () => {
    render(<StepCsvImport onImport={jest.fn()} onCancel={jest.fn()} />);
    expect(screen.getByTestId("csv-import-step")).toBeInTheDocument();
    expect(screen.getByText(/drag.*drop/i)).toBeInTheDocument();
  });

  it("calls onCancel when cancel is clicked", () => {
    const onCancel = jest.fn();
    render(<StepCsvImport onImport={jest.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByText("Cancel"));
    expect(onCancel).toHaveBeenCalled();
  });

  it("shows a per-row summary after file upload with valid and invalid rows", async () => {
    const csv = `commodity,quantity,unit,pricePerUnit,currency,sellerAddress\n${VALID_ROW}\n${INVALID_ROW}`;
    const onImport = jest.fn();
    render(<StepCsvImport onImport={onImport} onCancel={jest.fn()} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makeFile(csv)] } });

    await waitFor(() => expect(screen.getByTestId("csv-preview")).toBeInTheDocument());

    expect(screen.getByText(/1 valid row/i)).toBeInTheDocument();
    expect(screen.getByText(/1 invalid row/i)).toBeInTheDocument();
  });

  it("submits only valid rows and calls onImport with them", async () => {
    const csv = `commodity,quantity,unit,pricePerUnit,currency,sellerAddress\n${VALID_ROW}\n${INVALID_ROW}`;
    const onImport = jest.fn();
    render(<StepCsvImport onImport={onImport} onCancel={jest.fn()} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makeFile(csv)] } });

    await waitFor(() => screen.getByTestId("csv-preview"));
    fireEvent.click(screen.getByText(/submit 1 valid trade/i));

    expect(onImport).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ commodity: "Maize", quantity: "500" }),
      ]),
    );
    expect(onImport).toHaveBeenCalledTimes(1);
    expect((onImport.mock.calls[0][0] as TradeData[]).length).toBe(1);
  });

  it("shows an error for a non-CSV file", () => {
    render(<StepCsvImport onImport={jest.fn()} onCancel={jest.fn()} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["data"], "file.txt", { type: "text/plain" })] } });
    expect(screen.getByText(/\.csv file/i)).toBeInTheDocument();
  });
});
