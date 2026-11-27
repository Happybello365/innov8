"use client";
import { useRef, useState } from "react";
import { validateStep1 } from "../validation";
import type { TradeData } from "../TradeContext";
import { Button } from "@/components/ui/Button";

const CSV_HEADERS = ["commodity", "quantity", "unit", "pricePerUnit", "currency", "sellerAddress"] as const;

export interface CsvRow {
  rowIndex: number;
  data: Partial<TradeData>;
  errors: Record<string, string>;
  valid: boolean;
}

interface Props {
  onImport: (rows: TradeData[]) => void;
  onCancel: () => void;
}

function parseCsv(text: string): CsvRow[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());

  return lines.slice(1).map((line, i) => {
    const values = line.split(",").map((v) => v.trim());
    const raw: Record<string, string> = {};
    header.forEach((col, idx) => { raw[col] = values[idx] ?? ""; });

    const data: Partial<TradeData> = {
      commodity: raw.commodity ?? "",
      quantity: raw.quantity ?? "",
      unit: raw.unit ?? "kg",
      pricePerUnit: raw.priceperunit ?? raw.pricePerUnit ?? "",
      currency: raw.currency ?? "NGN",
      sellerAddress: raw.selleraddress ?? raw.sellerAddress ?? "",
    };

    const errors = validateStep1(data as Record<string, unknown>);
    return { rowIndex: i + 2, data, errors, valid: Object.keys(errors).length === 0 };
  });
}

export default function StepCsvImport({ onImport, onCancel }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [parsed, setParsed] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  function handleFile(file: File) {
    setFileError(null);
    if (!file.name.endsWith(".csv")) {
      setFileError("Please upload a .csv file.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const result = parseCsv(text);
      if (result.length === 0) {
        setFileError("CSV has no data rows. Make sure the file has a header and at least one data row.");
        return;
      }
      setRows(result);
      setParsed(true);
    };
    reader.readAsText(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  const validRows = rows.filter((r) => r.valid);
  const invalidRows = rows.filter((r) => !r.valid);

  function handleSubmit() {
    onImport(validRows.map((r) => r.data as TradeData));
  }

  return (
    <div className="flex flex-col gap-4" data-testid="csv-import-step">
      {!parsed ? (
        <>
          <p className="text-sm text-text-secondary">
            Upload a CSV with columns:{" "}
            <code className="text-xs bg-bg-elevated px-1 rounded">
              {CSV_HEADERS.join(", ")}
            </code>
          </p>

          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className="border-2 border-dashed border-border-default rounded-lg p-8 text-center cursor-pointer hover:border-gold transition-colors"
          >
            <p className="text-text-secondary text-sm">Drag &amp; drop a CSV file here, or click to browse</p>
            <input
              ref={inputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
          </div>

          {fileError && <p className="text-status-danger text-sm">{fileError}</p>}

          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        </>
      ) : (
        <>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-status-success font-medium">{validRows.length} valid row{validRows.length !== 1 ? "s" : ""}</span>
            {invalidRows.length > 0 && (
              <span className="text-status-error font-medium">{invalidRows.length} invalid row{invalidRows.length !== 1 ? "s" : ""} (will be skipped)</span>
            )}
          </div>

          <div className="overflow-auto max-h-60 rounded border border-border-default" data-testid="csv-preview">
            <table className="w-full text-xs">
              <thead className="bg-bg-elevated sticky top-0">
                <tr>
                  <th className="px-2 py-1 text-left text-text-secondary">Row</th>
                  <th className="px-2 py-1 text-left text-text-secondary">Commodity</th>
                  <th className="px-2 py-1 text-left text-text-secondary">Qty</th>
                  <th className="px-2 py-1 text-left text-text-secondary">Unit</th>
                  <th className="px-2 py-1 text-left text-text-secondary">Price</th>
                  <th className="px-2 py-1 text-left text-text-secondary">Seller</th>
                  <th className="px-2 py-1 text-left text-text-secondary">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.rowIndex} className={row.valid ? "" : "bg-status-error/10"}>
                    <td className="px-2 py-1 text-text-muted">{row.rowIndex}</td>
                    <td className="px-2 py-1">{row.data.commodity}</td>
                    <td className="px-2 py-1">{row.data.quantity}</td>
                    <td className="px-2 py-1">{row.data.unit}</td>
                    <td className="px-2 py-1">{row.data.pricePerUnit}</td>
                    <td className="px-2 py-1 font-mono truncate max-w-[100px]">{row.data.sellerAddress}</td>
                    <td className="px-2 py-1">
                      {row.valid ? (
                        <span className="text-status-success">✓</span>
                      ) : (
                        <span className="text-status-error" title={Object.values(row.errors).join("; ")}>
                          ✗ {Object.values(row.errors)[0]}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex gap-3">
            <Button
              variant="primary"
              onClick={handleSubmit}
              disabled={validRows.length === 0}
            >
              Submit {validRows.length} valid trade{validRows.length !== 1 ? "s" : ""}
            </Button>
            <Button variant="secondary" onClick={() => { setRows([]); setParsed(false); setFileError(null); }}>
              Re-upload
            </Button>
            <Button variant="secondary" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
