"use client";

import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  LogIn, LogOut, Clock, AlertCircle, CheckCircle2,
  XCircle, ChevronLeft, ChevronRight,
} from "lucide-react";

interface CheckInRecord {
  id: string;
  date: string;
  checkInTime: string | null;
  checkOutTime: string | null;
  isLate: boolean;
  lateMinutes: number | null;
  earlyCheckout: boolean;
  earlyMinutes: number | null;
  workingHours: number | null;
  status: string;
  checkInAddress: string | null;
  adminOverride: boolean;
  adminNote: string | null;
}

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  CHECKED_IN:     { label: "Checked In",    cls: "bg-green-100 text-green-700"   },
  CHECKED_OUT:    { label: "Checked Out",   cls: "bg-blue-100 text-blue-700"     },
  ABSENT:         { label: "Absent",        cls: "bg-red-100 text-red-700"       },
  ON_LEAVE:       { label: "On Leave",      cls: "bg-purple-100 text-purple-700" },
  ON_WFH:         { label: "WFH",           cls: "bg-cyan-100 text-cyan-700"     },
  NOT_CHECKED_IN: { label: "Not Checked In",cls: "bg-slate-100 text-slate-600"   },
};

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function fmtTime(dt: string | null) {
  if (!dt) return "—";
  return format(parseISO(dt), "hh:mm a");
}

export default function CheckInHistoryPage() {
  const now     = new Date();
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [records, setRecords] = useState<CheckInRecord[]>([]);
  const [total,   setTotal]   = useState(0);
  const [page,    setPage]    = useState(1);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.get("/employee/checkin/history", { params: { year, month, page, limit: 20 } })
      .then(r => { setRecords(r.data.data); setTotal(r.data.total); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [year, month, page]);

  const presentCount = records.filter(r => r.status === "CHECKED_IN" || r.status === "CHECKED_OUT").length;
  const absentCount  = records.filter(r => r.status === "ABSENT").length;
  const lateCount    = records.filter(r => r.isLate).length;
  const validHrs     = records.filter(r => r.workingHours != null);
  const avgHrs       = validHrs.length > 0
    ? (validHrs.reduce((s, r) => s + (r.workingHours ?? 0), 0) / validHrs.length).toFixed(1)
    : "0";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">My Attendance History</h1>
        <p className="text-sm text-slate-500 mt-0.5">Your daily check-in / check-out records</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <select
          value={String(month)}
          onChange={e => { setMonth(Number(e.target.value)); setPage(1); }}
          className="border rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-900 dark:border-slate-700 dark:text-white"
        >
          {MONTHS.map((m, i) => (
            <option key={m} value={String(i + 1)}>{m}</option>
          ))}
        </select>
        <select
          value={String(year)}
          onChange={e => { setYear(Number(e.target.value)); setPage(1); }}
          className="border rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-900 dark:border-slate-700 dark:text-white"
        >
          {[now.getFullYear(), now.getFullYear() - 1].map(y => (
            <option key={y} value={String(y)}>{y}</option>
          ))}
        </select>
        <span className="text-xs text-slate-500 ml-auto">{total} records</span>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Present",     value: presentCount,      color: "text-green-600" },
          { label: "Absent",      value: absentCount,       color: "text-red-600"   },
          { label: "Late Days",   value: lateCount,         color: "text-amber-600" },
          { label: "Avg Hrs/Day", value: `${avgHrs}h`,      color: "text-blue-600"  },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
            <p className="text-xs text-slate-500">{s.label}</p>
            <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Records */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        {loading ? (
          <div className="text-center py-12 text-slate-400">Loading…</div>
        ) : records.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            No records found for {MONTHS[month - 1]} {year}
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {records.map(r => {
              const sc = STATUS_CONFIG[r.status] ?? STATUS_CONFIG["NOT_CHECKED_IN"];
              return (
                <div key={r.id} className="flex flex-wrap items-center gap-4 px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  {/* Date */}
                  <div className="min-w-[140px]">
                    <p className="font-semibold text-slate-900 dark:text-white text-sm">
                      {format(parseISO(r.date), "EEE, dd MMM yyyy")}
                    </p>
                    {r.adminOverride && (
                      <span className="text-[10px] text-amber-600 font-medium">Admin Override</span>
                    )}
                  </div>

                  {/* Status badge */}
                  <span className={cn("inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium", sc.cls)}>
                    {sc.label}
                  </span>

                  {/* Times */}
                  <div className="flex items-center gap-5 flex-1">
                    <span className="flex items-center gap-1.5 text-sm">
                      <LogIn size={13} className="text-green-500" />
                      <span className="text-slate-700 dark:text-slate-300">{fmtTime(r.checkInTime)}</span>
                    </span>
                    <span className="flex items-center gap-1.5 text-sm">
                      <LogOut size={13} className="text-blue-500" />
                      <span className="text-slate-700 dark:text-slate-300">{fmtTime(r.checkOutTime)}</span>
                    </span>
                    {r.workingHours != null && (
                      <span className="flex items-center gap-1.5 text-sm">
                        <Clock size={13} className="text-slate-400" />
                        <span className="text-slate-600 dark:text-slate-400">{r.workingHours}h</span>
                      </span>
                    )}
                  </div>

                  {/* Flags */}
                  <div className="flex gap-2 flex-wrap justify-end min-w-[120px]">
                    {r.isLate && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                        <AlertCircle size={11} /> Late +{r.lateMinutes}m
                      </span>
                    )}
                    {r.earlyCheckout && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
                        Early -{r.earlyMinutes}m
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pagination */}
      {total > 20 && (
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
            <ChevronLeft size={14} />
          </Button>
          <span className="text-sm text-slate-600">Page {page} of {Math.ceil(total / 20)}</span>
          <Button variant="outline" size="sm" disabled={page >= Math.ceil(total / 20)} onClick={() => setPage(p => p + 1)}>
            <ChevronRight size={14} />
          </Button>
        </div>
      )}
    </div>
  );
}
