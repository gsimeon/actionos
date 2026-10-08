"use client";

import React, { useState } from "react";
import { Upload, CheckCircle2, AlertTriangle, FileSpreadsheet, ArrowRight, RefreshCw } from "lucide-react";
import { csvRowSchema } from "@/lib/validations";
import { formatNaira } from "@/lib/utils";

interface ParsedRow {
  data: Record<string, unknown>;
  valid: boolean;
  errors: string[];
}

const SAMPLE_CSV = `customer_number,full_name,phone,email,vehicle_registration,policy_number,provider,policy_type,start_date,expiry_date,premium,currency
CUS-000101,Oluwaseun Bakare,+2348039991122,oluwaseun.b@actionos.ng,LAG-441-XY,AUTO-2026-00301,Leadway Assurance,Comprehensive,2025-10-15,2026-10-15,95000,NGN
CUS-000102,Emeka Okafor,+2348028882233,emeka.o@actionos.ng,EN-102-AB,AUTO-2026-00302,AIICO Insurance,Comprehensive,2025-10-20,2026-10-20,110000,NGN
CUS-000103,Aisha Danjuma,+2348077773344,aisha.d@actionos.ng,KD-883-TR,AUTO-2026-00303,Demo Insurance,Third-Party,2025-09-01,2026-09-01,15000,NGN
CUS-INVALID,,invalid-phone,bad-email,PLATE,,Demo Insurance,Comprehensive,2025-01-01,2026-01-01,-5000,NGN`;

export function CsvImporter() {
  const [csvContent, setCsvContent] = useState<string>(SAMPLE_CSV);
  const [parsedRows, setParsedRows] = useState<ParsedRow[] | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importSummary, setImportSummary] = useState<{ validCount: number; invalidCount: number } | null>(null);

  const handleParseAndValidate = () => {
    const lines = csvContent.trim().split("\n");
    if (lines.length < 2) return;

    const headers = lines[0].split(",").map((h) => h.trim());
    const results: ParsedRow[] = [];
    let valid = 0;
    let invalid = 0;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const values = line.split(",").map((v) => v.trim());
      const rowObj: Record<string, unknown> = {};

      headers.forEach((h, idx) => {
        rowObj[h] = values[idx] || "";
      });

      const parsed = csvRowSchema.safeParse(rowObj);
      if (parsed.success) {
        results.push({
          data: parsed.data,
          valid: true,
          errors: [],
        });
        valid++;
      } else {
        const errorMessages = parsed.error.issues.map((iss) => `${iss.path.join(".")}: ${iss.message}`);
        results.push({
          data: rowObj,
          valid: false,
          errors: errorMessages,
        });
        invalid++;
      }
    }

    setParsedRows(results);
    setImportSummary({ validCount: valid, invalidCount: invalid });
  };

  const handleCommitImport = async () => {
    setIsImporting(true);
    // Simulate batch insertion
    setTimeout(() => {
      setIsImporting(false);
      alert(`Import Completed: ${importSummary?.validCount} valid rows committed to database.`);
      setParsedRows(null);
    }, 1200);
  };

  return (
    <div className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div>
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
          <h2 className="text-base font-bold text-slate-900 tracking-tight">
            Customer & Policy CSV Importer
          </h2>
        </div>
        <p className="text-xs text-slate-500 mt-1">
          Bulk batch ingestion pipeline with strict schema validation. Rejects corrupted and invalid rows.
        </p>
      </div>

      {/* CSV Input textarea */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <label className="text-slate-700 font-semibold">CSV Raw Text Input</label>
          <button
            type="button"
            onClick={() => setCsvContent(SAMPLE_CSV)}
            className="text-emerald-700 hover:text-emerald-800 hover:underline text-[11px] font-semibold cursor-pointer"
          >
            Reset to Sample Template
          </button>
        </div>
        <textarea
          rows={7}
          value={csvContent}
          onChange={(e) => setCsvContent(e.target.value)}
          className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-mono text-xs text-slate-800 outline-none focus:border-emerald-500 focus:bg-white transition-colors"
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleParseAndValidate}
          className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-md shadow-emerald-600/20 cursor-pointer flex items-center gap-2"
        >
          <Upload className="w-4 h-4" />
          <span>Parse & Validate Batch</span>
        </button>
      </div>

      {/* Validation Summary and Preview Table */}
      {parsedRows && importSummary && (
        <div className="space-y-4 pt-4 border-t border-slate-200">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                {importSummary.validCount} Valid Rows
              </span>
              <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold">
                <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                {importSummary.invalidCount} Invalid Rows (Flagged)
              </span>
            </div>

            <button
              type="button"
              onClick={handleCommitImport}
              disabled={isImporting || importSummary.validCount === 0}
              className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-md shadow-emerald-600/20"
            >
              {isImporting ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <span>Commit {importSummary.validCount} Valid Records</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase text-[10px] font-bold">
                <tr>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Customer</th>
                  <th className="px-4 py-2.5">Policy Number</th>
                  <th className="px-4 py-2.5">Vehicle Plate</th>
                  <th className="px-4 py-2.5">Premium</th>
                  <th className="px-4 py-2.5">Validation Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {parsedRows.map((r, i) => (
                  <tr key={i} className={r.valid ? "hover:bg-slate-50/80" : "bg-rose-50/40"}>
                    <td className="px-4 py-3">
                      {r.valid ? (
                        <span className="text-emerald-700 font-bold">VALID</span>
                      ) : (
                        <span className="text-rose-700 font-bold">REJECTED</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-900 font-medium">
                      {(r.data.full_name as string) || "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {(r.data.policy_number as string) || "—"}
                    </td>
                    <td className="px-4 py-3 text-emerald-700 font-bold">
                      {(r.data.vehicle_registration as string) || "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-900 font-bold">
                      {r.data.premium ? formatNaira(Number(r.data.premium)) : "—"}
                    </td>
                    <td className="px-4 py-3 text-[11px]">
                      {r.valid ? (
                        <span className="text-slate-500 font-sans">Schema verified</span>
                      ) : (
                        <span className="text-rose-700 font-sans font-medium">{r.errors.join("; ")}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
