"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle, Bell, BellOff, CalendarClock, CheckCircle2,
  ChevronLeft, ChevronRight, RefreshCw, Search, UserX, X,
} from "lucide-react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { WeaveSpinner } from "@/components/ui/weave-spinner";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";

interface NoticeEmployee {
  id: string;
  fullName: string;
  employeeId: string;
  department?: string;
  designation?: string;
  isOnNoticePeriod: boolean;
  noticePeriodStart?: string;
  noticePeriodEnd?: string;
  noticePeriodType?: string;
  earlyReleaseDate?: string | null;
  allowLeaveOverride: boolean;
  user?: { email: string };
  reportingManager?: { fullName: string; employeeId: string } | null;
}

function daysLeft(end?: string): number | null {
  if (!end) return null;
  return Math.ceil((new Date(end).getTime() - Date.now()) / 86400000);
}

function formatDate(d?: string) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function TypeBadge({ type }: { type?: string }) {
  const map: Record<string, string> = {
    RESIGNED:    "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    TERMINATED:  "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    MUTUAL:      "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  };
  if (!type) return null;
  return (
    <span className={cn("text-[11px] font-semibold px-2 py-0.5 rounded-full", map[type] ?? "bg-slate-100 text-slate-600")}>
      {type}
    </span>
  );
}

export default function NoticePeriodPage() {
  const [employees, setEmployees] = useState<NoticeEmployee[]>([]);
  const [total,     setTotal]     = useState(0);
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState("");
  const [page,      setPage]      = useState(1);
  const LIMIT = 15;

  const [selected, setSelected] = useState<NoticeEmployee | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [saving,   setSaving]   = useState(false);

  // edit form state
  const [form, setForm] = useState({
    noticePeriodType: "RESIGNED",
    noticePeriodStart: "",
    noticePeriodEnd: "",
    earlyReleaseDate: "",
    allowLeaveOverride: false,
  });

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
      if (search) params.set("search", search);
      const res = await api.get(`/admin/employees/on-notice?${params}`);
      setEmployees(res.data.data ?? []);
      setTotal(res.data.total ?? 0);
    } catch {
      toast.error("Failed to load notice period data");
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => { fetch(); }, [fetch]);

  function openEdit(emp: NoticeEmployee) {
    setSelected(emp);
    setForm({
      noticePeriodType:  emp.noticePeriodType  ?? "RESIGNED",
      noticePeriodStart: emp.noticePeriodStart ? emp.noticePeriodStart.slice(0,10) : "",
      noticePeriodEnd:   emp.noticePeriodEnd   ? emp.noticePeriodEnd.slice(0,10)   : "",
      earlyReleaseDate:  emp.earlyReleaseDate  ? emp.earlyReleaseDate.slice(0,10)  : "",
      allowLeaveOverride: emp.allowLeaveOverride,
    });
    setSheetOpen(true);
  }

  async function handleSave() {
    if (!selected) return;
    if (!form.noticePeriodStart || !form.noticePeriodEnd) {
      toast.error("Start and end dates are required");
      return;
    }
    setSaving(true);
    try {
      await api.patch(`/admin/employees/${selected.id}/notice`, {
        ...form,
        earlyReleaseDate: form.earlyReleaseDate || null,
      });
      toast.success("Notice period saved");
      setSheetOpen(false);
      fetch();
    } catch (e: any) {
      toast.error(e.response?.data?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleClear(emp: NoticeEmployee) {
    if (!confirm(`Clear notice period for ${emp.fullName}?`)) return;
    try {
      await api.delete(`/admin/employees/${emp.id}/notice`);
      toast.success("Notice period cleared");
      fetch();
    } catch (e: any) {
      toast.error(e.response?.data?.message || "Failed to clear");
    }
  }

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <CalendarClock size={20} className="text-amber-500" />
            Notice Period Management
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {total} employee{total !== 1 ? "s" : ""} currently on notice
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetch} disabled={loading} className="gap-1.5">
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          <Button size="sm" onClick={() => { setSelected(null); setForm({ noticePeriodType:"RESIGNED", noticePeriodStart:"", noticePeriodEnd:"", earlyReleaseDate:"", allowLeaveOverride:false }); setSheetOpen(true); }}>
            + Add to Notice
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search by name, ID, department…"
          className="w-full pl-8 pr-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        {search && (
          <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
            <X size={13} />
          </button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-24"><WeaveSpinner size={28} /></div>
      ) : employees.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-slate-400 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900">
          <UserX size={40} className="mb-3 opacity-30" />
          <p className="font-medium text-slate-600 dark:text-slate-300">No employees on notice</p>
          <p className="text-sm mt-1">All clear — no active notice periods.</p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                <tr>
                  {["Employee","Type","Notice Period","Early Release","Leave Override","Days Left","Actions"].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {employees.map((emp) => {
                  const left = daysLeft(emp.noticePeriodEnd);
                  const effectiveEnd = emp.earlyReleaseDate || emp.noticePeriodEnd;
                  const effectiveDaysLeft = daysLeft(effectiveEnd);
                  return (
                    <tr key={emp.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-900 dark:text-white">{emp.fullName}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{emp.employeeId} · {emp.department || "—"}</p>
                      </td>
                      <td className="px-4 py-3"><TypeBadge type={emp.noticePeriodType} /></td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300 text-xs">
                        <div>{formatDate(emp.noticePeriodStart)}</div>
                        <div className="text-slate-400">→ {formatDate(emp.noticePeriodEnd)}</div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">
                        {emp.earlyReleaseDate ? (
                          <span className="text-emerald-600 dark:text-emerald-400 font-medium">{formatDate(emp.earlyReleaseDate)}</span>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        {emp.allowLeaveOverride
                          ? <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-xs font-medium"><CheckCircle2 size={12} />Allowed</span>
                          : <span className="text-xs text-slate-400">Restricted</span>}
                      </td>
                      <td className="px-4 py-3">
                        {effectiveDaysLeft !== null ? (
                          <span className={cn(
                            "text-sm font-bold",
                            effectiveDaysLeft <= 0   ? "text-slate-400" :
                            effectiveDaysLeft <= 7   ? "text-red-600 dark:text-red-400" :
                            effectiveDaysLeft <= 14  ? "text-amber-600 dark:text-amber-400" :
                            "text-slate-900 dark:text-white"
                          )}>
                            {effectiveDaysLeft <= 0 ? "Expired" : `${effectiveDaysLeft}d`}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" onClick={() => openEdit(emp)} className="text-xs h-7 px-2">Edit</Button>
                          <Button variant="outline" size="sm" onClick={() => handleClear(emp)} className="text-xs h-7 px-2 text-red-600 hover:text-red-700 border-red-200 hover:border-red-300 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/20">Clear</Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {employees.map((emp) => {
              const effectiveEnd = emp.earlyReleaseDate || emp.noticePeriodEnd;
              const left = daysLeft(effectiveEnd);
              return (
                <div key={emp.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-white">{emp.fullName}</p>
                      <p className="text-xs text-slate-500">{emp.employeeId} · {emp.department || "—"}</p>
                    </div>
                    <TypeBadge type={emp.noticePeriodType} />
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <div><span className="font-medium text-slate-700 dark:text-slate-300">Start:</span> {formatDate(emp.noticePeriodStart)}</div>
                    <div><span className="font-medium text-slate-700 dark:text-slate-300">End:</span> {formatDate(emp.noticePeriodEnd)}</div>
                    {emp.earlyReleaseDate && <div className="col-span-2 text-emerald-600 dark:text-emerald-400"><span className="font-medium">Early Release:</span> {formatDate(emp.earlyReleaseDate)}</div>}
                    {left !== null && <div className="col-span-2"><span className="font-medium text-slate-700 dark:text-slate-300">Days left:</span> {left <= 0 ? "Expired" : `${left} days`}</div>}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => openEdit(emp)} className="flex-1 text-xs">Edit</Button>
                    <Button variant="outline" size="sm" onClick={() => handleClear(emp)} className="flex-1 text-xs text-red-600 border-red-200 hover:bg-red-50">Clear</Button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">Showing {(page-1)*LIMIT+1}–{Math.min(page*LIMIT, total)} of {total}</p>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" disabled={page===1} onClick={() => setPage(p=>p-1)}><ChevronLeft size={14}/></Button>
                <Button variant="outline" size="sm" disabled={page>=totalPages} onClick={() => setPage(p=>p+1)}><ChevronRight size={14}/></Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Edit / Add Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader className="mb-6">
            <SheetTitle>{selected ? `Edit — ${selected.fullName}` : "Add Employee to Notice"}</SheetTitle>
            <SheetDescription>Set notice period details. Early release overrides the end date for day count.</SheetDescription>
          </SheetHeader>

          {!selected && (
            <div className="mb-4 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-xs flex items-start gap-2">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              To add a new employee to notice, first search and select them from the Employees list, then use the Edit option.
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block mb-1.5">Notice Type</label>
              <select
                value={form.noticePeriodType}
                onChange={e => setForm(f => ({ ...f, noticePeriodType: e.target.value }))}
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                <option value="RESIGNED">Resigned</option>
                <option value="TERMINATED">Terminated</option>
                <option value="MUTUAL">Mutual Separation</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block mb-1.5">Start Date</label>
                <input type="date" value={form.noticePeriodStart} onChange={e => setForm(f => ({ ...f, noticePeriodStart: e.target.value }))}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/40" />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block mb-1.5">End Date</label>
                <input type="date" value={form.noticePeriodEnd} onChange={e => setForm(f => ({ ...f, noticePeriodEnd: e.target.value }))}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/40" />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block mb-1.5">
                Early Release Date <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <input type="date" value={form.earlyReleaseDate} onChange={e => setForm(f => ({ ...f, earlyReleaseDate: e.target.value }))}
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/40" />
              <p className="text-xs text-slate-400 mt-1">If set, employee is released earlier than the official end date.</p>
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              <div>
                <p className="text-sm font-medium text-slate-900 dark:text-white">Allow Leave During Notice</p>
                <p className="text-xs text-slate-500 mt-0.5">Employee can apply for leave during notice period</p>
              </div>
              <button
                onClick={() => setForm(f => ({ ...f, allowLeaveOverride: !f.allowLeaveOverride }))}
                className={cn(
                  "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                  form.allowLeaveOverride ? "bg-primary" : "bg-slate-200 dark:bg-slate-700"
                )}
              >
                <span className={cn("pointer-events-none block h-4 w-4 rounded-full bg-white shadow-lg transition-transform", form.allowLeaveOverride ? "translate-x-4" : "translate-x-0")} />
              </button>
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <Button variant="outline" onClick={() => setSheetOpen(false)} className="flex-1" disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} className="flex-1 gap-1.5" disabled={saving || !selected}>
              {saving && <WeaveSpinner size={13} />}
              {saving ? "Saving…" : "Save Changes"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
