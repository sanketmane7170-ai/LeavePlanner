"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Upload, CheckCircle2, XCircle, AlertTriangle, Search,
  Plus, Trash2, RefreshCw, FileText,
} from "lucide-react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { WeaveSpinner } from "@/components/ui/weave-spinner";

const LEAVE_TYPES = ["SICK", "TRANSPORT_WEATHER", "PERSONAL", "GENERAL"];
const LEAVE_TYPE_LABELS: Record<string, string> = {
  SICK: "Sick", TRANSPORT_WEATHER: "Transport/Weather", PERSONAL: "Personal", GENERAL: "General",
};

interface Employee { id: string; fullName: string; employeeId: string; department?: string; }
interface ImportRecord {
  id: string;
  leaveType: string;
  fromDate: string;
  toDate: string;
  reason: string;
  isHalfDay: boolean;
  halfDaySlot: string;
}
interface ImportResult {
  index: number;
  success: boolean;
  error?: string;
  totalDays?: number;
}

function newRecord(): ImportRecord {
  return { id: Math.random().toString(36).slice(2), leaveType: "SICK", fromDate: "", toDate: "", reason: "", isHalfDay: false, halfDaySlot: "FIRST_HALF" };
}

export default function BulkImportPage() {
  const [employees,      setEmployees]      = useState<Employee[]>([]);
  const [empSearch,      setEmpSearch]      = useState("");
  const [empLoading,     setEmpLoading]     = useState(false);
  const [selectedEmp,    setSelectedEmp]    = useState<Employee | null>(null);
  const [showEmpList,    setShowEmpList]    = useState(false);
  const [records,        setRecords]        = useState<ImportRecord[]>([newRecord()]);
  const [submitting,     setSubmitting]     = useState(false);
  const [results,        setResults]        = useState<ImportResult[] | null>(null);
  const [resultMessage,  setResultMessage]  = useState("");

  const searchEmployees = useCallback(async () => {
    if (!empSearch.trim()) { setEmployees([]); return; }
    setEmpLoading(true);
    try {
      const res = await api.get(`/admin/employees?search=${encodeURIComponent(empSearch)}&limit=10`);
      setEmployees(res.data.data ?? []);
    } catch {
      toast.error("Failed to search employees");
    } finally {
      setEmpLoading(false);
    }
  }, [empSearch]);

  useEffect(() => {
    const t = setTimeout(searchEmployees, 300);
    return () => clearTimeout(t);
  }, [searchEmployees]);

  function addRow() { setRecords(r => [...r, newRecord()]); }
  function removeRow(id: string) { setRecords(r => r.filter(x => x.id !== id)); }
  function updateRow(id: string, field: keyof ImportRecord, value: any) {
    setRecords(r => r.map(x => x.id === id ? { ...x, [field]: value } : x));
  }

  async function handleImport() {
    if (!selectedEmp) { toast.error("Please select an employee first"); return; }
    const invalid = records.find(r => !r.leaveType || !r.fromDate || !r.reason);
    if (invalid) { toast.error("All rows need a leave type, from date, and reason"); return; }

    setSubmitting(true);
    setResults(null);
    try {
      const res = await api.post("/admin/leaves/import/bulk", {
        employeeId: selectedEmp.id,
        records: records.map(r => ({
          leaveType:   r.leaveType,
          fromDate:    r.fromDate,
          toDate:      r.toDate || r.fromDate,
          reason:      r.reason,
          isHalfDay:   r.isHalfDay,
          halfDaySlot: r.isHalfDay ? r.halfDaySlot : undefined,
        })),
      });
      setResults(res.data.results ?? []);
      setResultMessage(res.data.message ?? "");
      const failed = (res.data.results ?? []).filter((r: ImportResult) => !r.success).length;
      if (failed === 0) {
        toast.success(`All ${records.length} records imported successfully!`);
      } else {
        toast.warning(`${records.length - failed} imported, ${failed} failed`);
      }
    } catch (e: any) {
      toast.error(e.response?.data?.message || "Import failed");
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setResults(null);
    setResultMessage("");
    setRecords([newRecord()]);
    setSelectedEmp(null);
    setEmpSearch("");
  }

  const successCount = results ? results.filter(r => r.success).length : 0;
  const failCount    = results ? results.filter(r => !r.success).length : 0;

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-5xl">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Upload size={20} className="text-primary" />
          Bulk Leave Import
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Import multiple leave records for an employee at once.
        </p>
      </div>

      {/* Results panel (shown after import) */}
      {results && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className={cn(
            "flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700",
            failCount === 0 ? "bg-emerald-50 dark:bg-emerald-900/10" : "bg-amber-50 dark:bg-amber-900/10"
          )}>
            <div className="flex items-center gap-3">
              {failCount === 0
                ? <CheckCircle2 size={20} className="text-emerald-600 dark:text-emerald-400" />
                : <AlertTriangle size={20} className="text-amber-600 dark:text-amber-400" />}
              <div>
                <p className="font-semibold text-slate-900 dark:text-white">Import Results</p>
                <p className="text-sm text-slate-500">{resultMessage}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{successCount} succeeded</span>
              {failCount > 0 && <span className="text-sm font-bold text-red-600 dark:text-red-400">{failCount} failed</span>}
              <Button variant="outline" size="sm" onClick={reset}>New Import</Button>
            </div>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {results.map((r, i) => (
              <div key={i} className={cn("flex items-start gap-3 px-4 py-3", !r.success && "bg-red-50/30 dark:bg-red-900/5")}>
                {r.success
                  ? <CheckCircle2 size={16} className="text-emerald-500 mt-0.5 shrink-0" />
                  : <XCircle     size={16} className="text-red-500 mt-0.5 shrink-0" />}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-white">
                    Row {r.index + 1} — {records[r.index]?.leaveType || ""}
                    {r.success && r.totalDays && <span className="text-slate-400 font-normal"> ({r.totalDays} day{r.totalDays !== 1 ? "s" : ""})</span>}
                  </p>
                  {!r.success && <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">{r.error}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!results && (
        <>
          {/* Step 1: Employee selection */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
            <h3 className="font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center">1</span>
              Select Employee
            </h3>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={empSearch}
                onChange={e => { setEmpSearch(e.target.value); setShowEmpList(true); }}
                onFocus={() => setShowEmpList(true)}
                placeholder="Search employee by name or ID…"
                className="w-full pl-8 pr-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              {empLoading && <WeaveSpinner size={14} className="absolute right-3 top-1/2 -translate-y-1/2" />}
            </div>

            {showEmpList && employees.length > 0 && (
              <div className="mt-2 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-lg z-10">
                {employees.map(emp => (
                  <button key={emp.id} onClick={() => { setSelectedEmp(emp); setEmpSearch(emp.fullName); setShowEmpList(false); }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 text-left transition-colors border-b border-slate-100 dark:border-slate-800 last:border-0">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="text-xs font-bold text-primary">{emp.fullName.charAt(0)}</span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-white">{emp.fullName}</p>
                      <p className="text-xs text-slate-400">{emp.employeeId} · {emp.department || "—"}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {selectedEmp && (
              <div className="mt-3 flex items-center gap-3 p-3 rounded-xl bg-primary/5 dark:bg-primary/10 border border-primary/20">
                <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-white">{selectedEmp.fullName.charAt(0)}</span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{selectedEmp.fullName}</p>
                  <p className="text-xs text-slate-500">{selectedEmp.employeeId}</p>
                </div>
                <CheckCircle2 size={16} className="text-primary ml-auto" />
              </div>
            )}
          </div>

          {/* Step 2: Records */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center">2</span>
                Leave Records ({records.length})
              </h3>
              <Button variant="outline" size="sm" onClick={addRow} className="gap-1.5">
                <Plus size={13} /> Add Row
              </Button>
            </div>

            <div className="space-y-3">
              {records.map((rec, i) => (
                <div key={rec.id} className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Record {i + 1}</span>
                    {records.length > 1 && (
                      <button onClick={() => removeRow(rec.id)} className="text-slate-400 hover:text-red-500 transition-colors">
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    <div>
                      <label className="text-[11px] font-medium text-slate-500 mb-1 block">Leave Type</label>
                      <select value={rec.leaveType} onChange={e => updateRow(rec.id, "leaveType", e.target.value)}
                        className="w-full px-2.5 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/40">
                        {LEAVE_TYPES.map(t => <option key={t} value={t}>{LEAVE_TYPE_LABELS[t]}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] font-medium text-slate-500 mb-1 block">From Date</label>
                      <input type="date" value={rec.fromDate} onChange={e => updateRow(rec.id, "fromDate", e.target.value)}
                        className="w-full px-2.5 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/40" />
                    </div>
                    <div>
                      <label className="text-[11px] font-medium text-slate-500 mb-1 block">To Date <span className="text-slate-400">(optional)</span></label>
                      <input type="date" value={rec.toDate} onChange={e => updateRow(rec.id, "toDate", e.target.value)}
                        className="w-full px-2.5 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/40" />
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-slate-500 mb-1 block">Reason</label>
                    <input type="text" value={rec.reason} onChange={e => updateRow(rec.id, "reason", e.target.value)}
                      placeholder="Enter reason…"
                      className="w-full px-2.5 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/40" />
                  </div>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={rec.isHalfDay} onChange={e => updateRow(rec.id, "isHalfDay", e.target.checked)}
                        className="w-3.5 h-3.5 rounded border-slate-300 text-primary focus:ring-primary/40" />
                      <span className="text-xs text-slate-700 dark:text-slate-300">Half Day</span>
                    </label>
                    {rec.isHalfDay && (
                      <select value={rec.halfDaySlot} onChange={e => updateRow(rec.id, "halfDaySlot", e.target.value)}
                        className="px-2 py-1 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none">
                        <option value="FIRST_HALF">First Half</option>
                        <option value="SECOND_HALF">Second Half</option>
                      </select>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Import button */}
          <div className="flex gap-3">
            <Button onClick={addRow} variant="outline" className="gap-1.5">
              <Plus size={14} /> Add Another Row
            </Button>
            <Button
              onClick={handleImport}
              disabled={!selectedEmp || submitting || records.length === 0}
              className="gap-2 flex-1 sm:flex-none sm:min-w-[160px]"
            >
              {submitting ? <WeaveSpinner size={14} /> : <Upload size={14} />}
              {submitting ? "Importing…" : `Import ${records.length} Record${records.length !== 1 ? "s" : ""}`}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
