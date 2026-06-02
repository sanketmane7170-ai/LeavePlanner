"use client";

import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  Download,
  Upload,
  Plus, 
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  X,
  FileText,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import api from "@/lib/api";
import { formatDate, LEAVE_TYPE_LABELS, leaveStatusVariant } from "@/lib/utils";
import type { LeaveApplication, LeaveBalance, LeavePolicy } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { WeaveSpinner } from "@/components/ui/weave-spinner";



// ── Status badge ──────────────────────────────────────────────────────────────
type SV = "success" | "warning" | "destructive" | "gray" | "default";
const svClass: Record<SV, string> = {
  success:     "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  warning:     "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  destructive: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  gray:        "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  default:     "bg-primary/10 text-primary",
};

function StatusBadge({ status }: { status: string }) {
  const v = leaveStatusVariant(status as any) as SV;
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold", svClass[v])}>
      {status}
    </span>
  );
}

// ── CSV helpers ───────────────────────────────────────────────────────────────
interface CsvRow {
  leaveType: string;
  fromDate: string;
  toDate: string;
  reason: string;
  isHalfDay: string;
  halfDaySlot: string;
  // validation
  _valid: boolean;
  _error: string;
}

const VALID_LEAVE_TYPES = ["SICK", "TRANSPORT_WEATHER", "PERSONAL"];
const VALID_SLOTS = ["FIRST_HALF", "SECOND_HALF", ""];

function validateRow(row: Omit<CsvRow, "_valid" | "_error">): { valid: boolean; error: string } {
  if (!VALID_LEAVE_TYPES.includes(row.leaveType.toUpperCase())) {
    return { valid: false, error: `Invalid leaveType "${row.leaveType}"` };
  }
  if (!row.fromDate || isNaN(Date.parse(row.fromDate))) {
    return { valid: false, error: "Invalid fromDate" };
  }
  if (row.toDate && isNaN(Date.parse(row.toDate))) {
    return { valid: false, error: "Invalid toDate" };
  }
  if (row.toDate && new Date(row.toDate) < new Date(row.fromDate)) {
    return { valid: false, error: "toDate must be ≥ fromDate" };
  }
  if (!row.reason.trim()) {
    return { valid: false, error: "reason is required" };
  }
  const halfDay = row.isHalfDay.toLowerCase();
  if (halfDay === "true" && !VALID_SLOTS.includes(row.halfDaySlot.toUpperCase())) {
    return { valid: false, error: "halfDaySlot must be FIRST_HALF or SECOND_HALF when isHalfDay=true" };
  }
  return { valid: true, error: "" };
}

function parseCSV(text: string): CsvRow[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const rawHeaders = lines[0]!.split(",").map((h) => h.trim().toLowerCase().replace(/\s+/g, ""));
  const headerMap: Record<string, string> = {
    leavetype: "leaveType",
    fromdate: "fromDate",
    todate: "toDate",
    reason: "reason",
    ishalfday: "isHalfDay",
    halfday: "isHalfDay",
    halfdayslot: "halfDaySlot",
    slot: "halfDaySlot",
  };

  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || !line.trim()) continue;
    const values = line.split(",").map((v) => v.trim());
    const raw: Record<string, string> = {};
    rawHeaders.forEach((h, idx) => {
      const mapped = headerMap[h] ?? h;
      raw[mapped] = values[idx] ?? "";
    });

    const base = {
      leaveType: (raw["leaveType"] ?? "").toUpperCase(),
      fromDate: raw["fromDate"] ?? "",
      toDate: raw["toDate"] ?? "",
      reason: raw["reason"] ?? "",
      isHalfDay: raw["isHalfDay"] ?? "false",
      halfDaySlot: (raw["halfDaySlot"] ?? "").toUpperCase(),
    };
    const { valid, error } = validateRow(base);
    rows.push({ ...base, _valid: valid, _error: error });
  }
  return rows;
}

// ── Manual import schema ──────────────────────────────────────────────────────
const manualSchema = z.object({
  leaveType: z.enum(["SICK", "TRANSPORT_WEATHER", "PERSONAL"]),
  fromDate: z.string().min(1, "Required"),
  toDate: z.string().optional(),
  reason: z.string().min(2, "Required"),
  isHalfDay: z.boolean(),
  halfDaySlot: z.enum(["FIRST_HALF", "SECOND_HALF"]).optional(),
});
type ManualForm = z.infer<typeof manualSchema>;

// ── Main Component ────────────────────────────────────────────────────────────
interface EmployeeLeavesTabProps {
  employeeId: string;
}

export function EmployeeLeavesTab({ employeeId }: EmployeeLeavesTabProps) {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);

  // Balance
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [leavePolicy, setLeavePolicy] = useState<LeavePolicy | null>(null);
  const [loadingBalance, setLoadingBalance] = useState(true);

  // Leave history
  const [leaves, setLeaves] = useState<LeaveApplication[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 10;
  const totalPages = Math.ceil(total / limit);
  const [loadingLeaves, setLoadingLeaves] = useState(true);

  // Import modal
  const [importOpen, setImportOpen] = useState(false);
  const [importTab, setImportTab] = useState<"manual" | "csv">("manual");
  const [importing, setImporting] = useState(false);

  // Manual import form
  const { register, handleSubmit, watch, setValue, reset: resetForm, formState: { errors } } = useForm<ManualForm>({
    resolver: zodResolver(manualSchema),
    defaultValues: { isHalfDay: false, leaveType: "SICK" },
  });
  const watchHalfDay = watch("isHalfDay");

  // CSV import state
  const [csvRows, setCsvRows] = useState<CsvRow[]>([]);
  const [csvFileName, setCsvFileName] = useState("");

  // Fetch balance
  const fetchBalance = useCallback(async () => {
    setLoadingBalance(true);
    try {
      const res = await api.get(`/admin/leaves/balance/${employeeId}?year=${year}`);
      setBalances(res.data.balances ?? []);
      setLeavePolicy(res.data.leavePolicy ?? null);
    } catch {
      setBalances([]);
    } finally {
      setLoadingBalance(false);
    }
  }, [employeeId, year]);

  // Fetch leave history
  const fetchLeaves = useCallback(async () => {
    setLoadingLeaves(true);
    try {
      const res = await api.get(`/admin/leaves/employee/${employeeId}?year=${year}&page=${page}&limit=${limit}`);
      setLeaves(res.data.data ?? []);
      setTotal(res.data.total ?? 0);
    } catch {
      setLeaves([]);
    } finally {
      setLoadingLeaves(false);
    }
  }, [employeeId, year, page]);

  useEffect(() => { fetchBalance(); }, [fetchBalance]);
  useEffect(() => { fetchLeaves(); }, [fetchLeaves]);
  useEffect(() => { setPage(1); }, [year]);

  // ── CSV upload ──────────────────────────────────────────────────────────────
  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setCsvRows(parseCSV(text));
    };
    reader.readAsText(file);
  };

  const removeCsvRow = (idx: number) => setCsvRows((prev) => prev.filter((_, i) => i !== idx));

  const downloadTemplate = () => {
    const lines = [
      "leaveType,fromDate,toDate,reason,isHalfDay,halfDaySlot",
      "SICK,2024-01-15,2024-01-17,Past sick leave,,",
      "TRANSPORT_WEATHER,2024-02-20,2024-02-20,Weather disruption,,",
      "PERSONAL,2024-03-01,2024-03-01,Family function,true,FIRST_HALF",
    ].join("\n");
    const blob = new Blob([lines], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "leave_import_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Manual submit ────────────────────────────────────────────────────────────
  const onManualSubmit = async (data: ManualForm) => {
    setImporting(true);
    try {
      await api.post("/admin/leaves/import", {
        employeeId,
        leaveType: data.leaveType,
        fromDate: data.fromDate,
        toDate: data.toDate || data.fromDate,
        isHalfDay: data.isHalfDay,
        halfDaySlot: data.isHalfDay ? data.halfDaySlot : undefined,
        reason: data.reason,
      });
      toast.success("Leave record imported successfully");
      setImportOpen(false);
      resetForm({ isHalfDay: false, leaveType: "SICK" });
      fetchLeaves();
      fetchBalance();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Import failed");
    } finally {
      setImporting(false);
    }
  };

  // ── CSV bulk submit ──────────────────────────────────────────────────────────
  const onCsvSubmit = async () => {
    const validRows = csvRows.filter((r) => r._valid);
    if (validRows.length === 0) { toast.error("No valid rows to import"); return; }
    setImporting(true);
    try {
      const records = validRows.map((r) => ({
        leaveType: r.leaveType,
        fromDate: r.fromDate,
        toDate: r.toDate || r.fromDate,
        reason: r.reason,
        isHalfDay: r.isHalfDay.toLowerCase() === "true",
        halfDaySlot: r.halfDaySlot || undefined,
      }));
      const res = await api.post("/admin/leaves/import/bulk", { employeeId, records });
      toast.success(res.data.message);
      setImportOpen(false);
      setCsvRows([]);
      setCsvFileName("");
      fetchLeaves();
      fetchBalance();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Bulk import failed");
    } finally {
      setImporting(false);
    }
  };

  const yearOpts = [currentYear, currentYear - 1, currentYear - 2];
  const validCsvRows = csvRows.filter((r) => r._valid).length;
  const invalidCsvRows = csvRows.length - validCsvRows;

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Year selector + Import button */}
      <div className="flex items-center justify-between gap-2">
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="h-8 px-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          {yearOpts.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <Button size="sm" onClick={() => setImportOpen(true)} className="h-8 text-xs">
          <Plus size={13} className="mr-1" />
          Import Records
        </Button>
      </div>

      {/* Balance */}
      {loadingBalance ? (
        <div className="flex justify-center py-4"><WeaveSpinner className="animate-spin text-primary" size={18} /></div>
      ) : balances.length > 0 ? (
        <div className="grid gap-3">
          {balances.map((b) => {
            const pct = b.totalDays > 0 ? (b.remainingDays / b.totalDays) * 100 : 0;
            const barColor = pct > 50 ? "bg-green-500" : pct > 20 ? "bg-amber-500" : "bg-red-500";
            return (
              <div key={b.id} className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                    {LEAVE_TYPE_LABELS[b.leaveType] ?? b.leaveType}
                  </span>
                  <span className="text-sm font-bold text-slate-900 dark:text-white">
                    {b.remainingDays}/{b.totalDays} days
                  </span>
                </div>
                <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div className={cn("h-full rounded-full", barColor)} style={{ width: `${100 - pct}%` }} />
                </div>
                <div className="flex justify-between text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  <span>{b.usedDays} used</span>
                  <span>{b.remainingDays} remaining</span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-slate-400 text-center py-4">No balance record for {year}</p>
      )}

      {/* Leave history */}
      <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
        <div className="bg-slate-50 dark:bg-slate-800 px-3 py-2 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">
            Leave History
          </span>
          <span className="text-xs text-slate-500">{total} records</span>
        </div>

        {loadingLeaves ? (
          <div className="flex justify-center py-6"><WeaveSpinner className="animate-spin text-primary" size={18} /></div>
        ) : leaves.length === 0 ? (
          <div className="text-center py-8 text-slate-400">
            <CalendarDays size={28} className="mx-auto mb-2 opacity-40" />
            <p className="text-xs">No leave records for {year}</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {leaves.map((leave) => (
              <div key={leave.id} className="px-3 py-2.5 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      {formatDate(leave.fromDate)}
                      {leave.fromDate !== leave.toDate && ` → ${formatDate(leave.toDate)}`}
                    </span>
                    {leave.isAdminEntry && (
                      <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium">
                        Admin
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate max-w-[200px]">
                    {LEAVE_TYPE_LABELS[leave.leaveType] ?? leave.leaveType} · {leave.totalDays}d · {leave.reason}
                  </p>
                </div>
                <StatusBadge status={leave.status} />
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-3 py-2 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500">
            <span>{(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}</span>
            <div className="flex gap-1">
              <button disabled={page === 1} onClick={() => setPage((p) => p - 1)} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40">
                <ChevronLeft size={13} />
              </button>
              <button disabled={page === totalPages} onClick={() => setPage((p) => p + 1)} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40">
                <ChevronRight size={13} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Import Dialog ──────────────────────────────────────────────────────── */}
      <Dialog open={importOpen} onOpenChange={(o) => { if (!o) { setImportOpen(false); setCsvRows([]); setCsvFileName(""); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Import Past Leave Records</DialogTitle>
            <DialogDescription>
              Imported records are auto-approved and immediately deduct from the employee&apos;s balance.
            </DialogDescription>
          </DialogHeader>

          {/* Tab switcher */}
          <div className="flex border-b border-slate-200 dark:border-slate-800 -mt-2">
            {(["manual", "csv"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setImportTab(tab)}
                className={cn(
                  "px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px",
                  importTab === tab
                    ? "border-primary text-primary"
                    : "border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white"
                )}
              >
                {tab === "manual" ? "Single Entry" : "CSV Bulk"}
              </button>
            ))}
          </div>

          {/* Manual Entry */}
          {importTab === "manual" && (
            /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
            <form onSubmit={handleSubmit(onManualSubmit as any)}>
              <div className="grid grid-cols-2 gap-4 mt-2">
                <Select label="Leave Type *" error={errors.leaveType?.message} {...register("leaveType")}>
                  <option value="SICK">Sick Leave</option>
                  <option value="TRANSPORT_WEATHER">Transport / Weather</option>
                  <option value="PERSONAL">Personal Leave</option>
                </Select>

                <Input label="From Date *" type="date" error={errors.fromDate?.message} {...register("fromDate")} />
                <Input label="To Date" type="date" {...register("toDate")} />

                <div className="flex items-center gap-3 pt-5">
                  <label className="text-sm text-slate-700 dark:text-slate-300">Half Day</label>
                  <button
                    type="button"
                    onClick={() => setValue("isHalfDay", !watchHalfDay)}
                    className={cn(
                      "relative inline-flex h-5 w-10 shrink-0 rounded-full transition-colors",
                      watchHalfDay ? "bg-primary" : "bg-slate-200 dark:bg-slate-700"
                    )}
                  >
                    <span className={cn(
                      "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
                      watchHalfDay ? "translate-x-5" : "translate-x-0.5"
                    )} />
                  </button>
                </div>

                {watchHalfDay && (
                  <Select label="Slot" {...register("halfDaySlot")}>
                    <option value="FIRST_HALF">First Half</option>
                    <option value="SECOND_HALF">Second Half</option>
                  </Select>
                )}

                <div className="col-span-2">
                  <Input label="Reason *" placeholder="Brief reason for leave" error={errors.reason?.message} {...register("reason")} />
                </div>
              </div>

              <DialogFooter className="mt-4">
                <Button type="button" variant="outline" onClick={() => setImportOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={importing}>
                  {importing && <WeaveSpinner className="animate-spin mr-2" size={14} />}
                  Import Record
                </Button>
              </DialogFooter>
            </form>
          )}

          {/* CSV Bulk */}
          {importTab === "csv" && (
            <div className="space-y-4 mt-2">
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Upload a CSV file matching the required format.
                </p>
                <Button variant="ghost" size="sm" onClick={downloadTemplate} className="h-8 text-xs">
                  <Download size={13} className="mr-1" />
                  Template
                </Button>
              </div>

              {/* File input */}
              <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl cursor-pointer hover:border-primary/50 transition-colors bg-slate-50 dark:bg-slate-900">
                <Upload size={18} className="text-slate-400 mb-1.5" />
                <span className="text-sm text-slate-500 dark:text-slate-400">
                  {csvFileName || "Click to upload CSV"}
                </span>
                <input type="file" accept=".csv,text/csv" className="hidden" onChange={handleCsvUpload} />
              </label>

              {/* CSV preview */}
              {csvRows.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      Preview ({csvRows.length} rows)
                    </p>
                    <div className="flex items-center gap-3 text-xs">
                      {validCsvRows > 0 && (
                        <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                          <CheckCircle2 size={12} /> {validCsvRows} valid
                        </span>
                      )}
                      {invalidCsvRows > 0 && (
                        <span className="flex items-center gap-1 text-red-500 dark:text-red-400">
                          <AlertTriangle size={12} /> {invalidCsvRows} invalid
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden max-h-52 overflow-y-auto scrollbar-thin">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 dark:bg-slate-800 sticky top-0">
                        <tr>
                          <th className="text-left px-3 py-2 font-semibold text-slate-500 uppercase tracking-wide">Type</th>
                          <th className="text-left px-3 py-2 font-semibold text-slate-500 uppercase tracking-wide">From</th>
                          <th className="text-left px-3 py-2 font-semibold text-slate-500 uppercase tracking-wide">To</th>
                          <th className="text-left px-3 py-2 font-semibold text-slate-500 uppercase tracking-wide">Reason</th>
                          <th className="text-left px-3 py-2 font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                          <th className="px-3 py-2" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {csvRows.map((row, idx) => (
                          <tr key={idx} className={cn(!row._valid && "bg-red-50 dark:bg-red-900/10")}>
                            <td className="px-3 py-2">{row.leaveType}</td>
                            <td className="px-3 py-2">{row.fromDate}</td>
                            <td className="px-3 py-2">{row.toDate || row.fromDate}</td>
                            <td className="px-3 py-2 max-w-[120px] truncate">{row.reason}</td>
                            <td className="px-3 py-2">
                              {row._valid ? (
                                <span className="text-green-600 dark:text-green-400">✓</span>
                              ) : (
                                <span className="text-red-500" title={row._error}>✗ {row._error}</span>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              <button onClick={() => removeCsvRow(idx)} className="text-slate-400 hover:text-red-500">
                                <X size={12} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* CSV note */}
              <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-xs border border-amber-200 dark:border-amber-800">
                <FileText size={13} className="shrink-0 mt-0.5" />
                <span>Only valid rows will be imported. Invalid rows are skipped. Expected columns: <code>leaveType, fromDate, toDate, reason, isHalfDay, halfDaySlot</code></span>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setImportOpen(false)}>Cancel</Button>
                <Button
                  onClick={onCsvSubmit}
                  disabled={importing || validCsvRows === 0}
                >
                  {importing && <WeaveSpinner className="animate-spin mr-2" size={14} />}
                  Import {validCsvRows > 0 ? `${validCsvRows} Record${validCsvRows > 1 ? "s" : ""}` : ""}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
