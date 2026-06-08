"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { CalendarDays, ChevronLeft, ChevronRight, RefreshCw, Sun } from "lucide-react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { WeaveSpinner } from "@/components/ui/weave-spinner";

interface PublicHoliday {
  id: string;
  name: string;
  date: string;
  year: number;
}

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS   = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

function isFuture(d: string) { return new Date(d) >= new Date(new Date().toDateString()); }
function isToday(d: string)  { return new Date(d).toDateString() === new Date().toDateString(); }

export default function HolidaysPage() {
  const currentYear = new Date().getFullYear();
  const [year,     setYear]     = useState(currentYear);
  const [holidays, setHolidays] = useState<PublicHoliday[]>([]);
  const [loading,  setLoading]  = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/employee/portal/holidays?year=${year}`);
      setHolidays(Array.isArray(res.data) ? res.data : []);
    } catch {
      toast.error("Failed to load holidays");
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => { fetch(); }, [fetch]);

  const grouped: Record<number, PublicHoliday[]> = {};
  for (const h of holidays) {
    const m = new Date(h.date).getMonth();
    if (!grouped[m]) grouped[m] = [];
    grouped[m]!.push(h);
  }

  const upcoming = holidays.filter(h => isFuture(h.date) && !isToday(h.date));
  const next = upcoming[0];

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Sun size={20} className="text-amber-500" />
            Company Holidays
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {holidays.length} holiday{holidays.length !== 1 ? "s" : ""} in {year}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetch} disabled={loading} className="gap-1.5">
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          </Button>
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-xl p-1">
            <button onClick={() => setYear(y => y - 1)} className="p-1.5 rounded-lg hover:bg-white dark:hover:bg-slate-700 transition-colors">
              <ChevronLeft size={14} />
            </button>
            <span className="px-3 text-sm font-semibold text-slate-900 dark:text-white min-w-[52px] text-center">{year}</span>
            <button onClick={() => setYear(y => y + 1)} className="p-1.5 rounded-lg hover:bg-white dark:hover:bg-slate-700 transition-colors">
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Next holiday banner */}
      {next && year === currentYear && (
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border border-amber-100 dark:border-amber-800">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
            <CalendarDays size={20} className="text-amber-600" />
          </div>
          <div>
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide">Next Holiday</p>
            <p className="font-semibold text-slate-900 dark:text-white">{next.name}</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {new Date(next.date).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
              {" "}·{" "}
              {Math.ceil((new Date(next.date).getTime() - Date.now()) / 86400000)} days away
            </p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-24"><WeaveSpinner size={28} /></div>
      ) : holidays.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-slate-400 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900">
          <Sun size={40} className="mb-3 opacity-30" />
          <p className="font-medium text-slate-600 dark:text-slate-300">No holidays for {year}</p>
          <p className="text-sm mt-1">Contact your admin to add company holidays.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 12 }, (_, i) => i).map(m => {
            const monthHolidays = grouped[m] ?? [];
            if (monthHolidays.length === 0) return null;
            return (
              <div key={m} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                  <h3 className="font-semibold text-slate-900 dark:text-white text-sm">{MONTHS[m]}</h3>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {monthHolidays.map(h => {
                    const d    = new Date(h.date);
                    const past = !isFuture(h.date) && !isToday(h.date);
                    const today = isToday(h.date);
                    return (
                      <div key={h.id} className={cn("flex items-center gap-3 px-4 py-3", today && "bg-amber-50/50 dark:bg-amber-900/10")}>
                        <div className={cn(
                          "w-10 h-10 rounded-xl flex flex-col items-center justify-center shrink-0 text-center",
                          today  ? "bg-amber-500 text-white" :
                          past   ? "bg-slate-100 dark:bg-slate-800 text-slate-400" :
                                   "bg-primary/10 text-primary"
                        )}>
                          <span className="text-[10px] font-bold uppercase leading-none">{DAYS[d.getDay()]}</span>
                          <span className="text-sm font-bold leading-tight">{d.getDate()}</span>
                        </div>
                        <div className="min-w-0">
                          <p className={cn("font-medium text-sm truncate", past ? "text-slate-400 dark:text-slate-500" : "text-slate-900 dark:text-white")}>
                            {h.name}
                          </p>
                          <p className="text-xs text-slate-400 dark:text-slate-500">
                            {d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
                          </p>
                        </div>
                        {today && (
                          <span className="ml-auto shrink-0 text-[10px] font-bold bg-amber-500 text-white px-2 py-0.5 rounded-full">TODAY</span>
                        )}
                        {past && !today && (
                          <span className="ml-auto shrink-0 text-[10px] text-slate-400">Past</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Summary row */}
      {holidays.length > 0 && !loading && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Total Holidays", value: holidays.length, color: "text-primary" },
            { label: "Upcoming",       value: upcoming.length, color: "text-emerald-600 dark:text-emerald-400" },
            { label: "Past",           value: holidays.length - upcoming.length - (next && isToday(holidays.find(h => isToday(h.date))?.date || "") ? 1 : 0), color: "text-slate-400" },
          ].map(s => (
            <div key={s.label} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 text-center">
              <p className={cn("text-2xl font-bold", s.color)}>{s.value}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
