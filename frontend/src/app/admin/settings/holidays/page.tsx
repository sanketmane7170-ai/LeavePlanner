"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { CalendarDays, Plus, Trash2, Sun, ChevronDown } from "lucide-react";
import api from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { WeaveSpinner } from "@/components/ui/weave-spinner";
import { cn } from "@/lib/utils";

interface Holiday {
  id: string;
  name: string;
  date: string;
  year: number;
}

const DAY_COLORS = [
  "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400",
  "bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400",
  "bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400",
  "bg-yellow-50 dark:bg-yellow-900/20 text-yellow-600 dark:text-yellow-400",
  "bg-lime-50 dark:bg-lime-900/20 text-lime-600 dark:text-lime-400",
  "bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400",
  "bg-teal-50 dark:bg-teal-900/20 text-teal-600 dark:text-teal-400",
];

export default function HolidaysPage() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(false);
  const [newDate, setNewDate] = useState("");
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchHolidays = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/admin/settings/holidays?year=${year}`);
      setHolidays(res.data);
    } catch {
      toast.error("Failed to load holidays");
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => { fetchHolidays(); }, [fetchHolidays]);

  const handleAdd = async () => {
    if (!newDate || !newName.trim()) { toast.error("Date and name required"); return; }
    setAdding(true);
    try {
      await api.post("/admin/settings/holidays", { date: newDate, name: newName.trim(), year });
      toast.success("Holiday added");
      setNewDate(""); setNewName("");
      fetchHolidays();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to add holiday");
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this holiday?")) return;
    setDeletingId(id);
    try {
      await api.delete(`/admin/settings/holidays/${id}`);
      toast.success("Holiday deleted");
      fetchHolidays();
    } catch {
      toast.error("Failed to delete holiday");
    } finally {
      setDeletingId(null);
    }
  };

  const yearOpts = [currentYear - 1, currentYear, currentYear + 1, currentYear + 2];

  return (
    <div className="w-full max-w-4xl space-y-4">
      {/* Page Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-500/10 via-orange-400/5 to-transparent border border-amber-200/50 dark:border-amber-800/30 p-5">
        <div className="relative flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0">
              <Sun className="text-amber-600 dark:text-amber-400" size={20} />
            </div>
            <div>
              <h1 className="text-lg font-heading font-bold text-slate-900 dark:text-white leading-tight">Public Holidays</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                Configure holidays to accurately calculate working days.
              </p>
            </div>
          </div>

          {/* Year selector */}
          <div className="relative shrink-0">
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="appearance-none h-9 pl-3 pr-8 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/40 shadow-sm cursor-pointer"
            >
              {yearOpts.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
        </div>
        <div className="absolute -right-6 -bottom-6 h-28 w-28 rounded-full bg-amber-400/10 blur-2xl pointer-events-none" />
      </div>

      {/* Stats pill */}
      <div className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm w-fit text-sm">
        <CalendarDays size={14} className="text-primary" />
        <span className="font-semibold text-slate-900 dark:text-white">{holidays.length}</span>
        <span className="text-slate-500 dark:text-slate-400">holidays in {year}</span>
      </div>

      {/* Add form */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-5">
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">Add New Holiday</p>
        {/* Stacked on mobile, row on sm+ */}
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="date"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
            className="h-11 px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 transition-all w-full sm:w-auto"
          />
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Holiday name (e.g. Diwali)"
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            className="flex-1 h-11 px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 transition-all"
          />
          <button
            onClick={handleAdd}
            disabled={adding}
            className="flex items-center justify-center gap-2 h-11 px-5 rounded-xl bg-primary text-white text-sm font-semibold shadow-sm shadow-primary/30 hover:bg-primary/90 disabled:opacity-60 transition-all shrink-0"
          >
            {adding ? <WeaveSpinner className="animate-spin" size={15} /> : <Plus size={15} />}
            Add Holiday
          </button>
        </div>
      </div>

      {/* Holiday list */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <WeaveSpinner className="animate-spin text-primary" size={28} />
          <p className="text-sm text-slate-500">Loading holidays…</p>
        </div>
      ) : holidays.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-slate-900 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
          <div className="h-14 w-14 rounded-full bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center mx-auto mb-4">
            <CalendarDays size={24} className="text-amber-500 opacity-60" />
          </div>
          <p className="font-medium text-slate-700 dark:text-slate-300">No holidays for {year}</p>
          <p className="text-sm text-slate-400 mt-1">Add the first holiday using the form above.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          {/* Desktop table header — hidden on mobile */}
          <div className="hidden sm:grid grid-cols-[1fr_2fr_1fr_44px] px-5 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/80 gap-4">
            {["Date", "Holiday Name", "Day", ""].map((h, i) => (
              <span key={i} className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{h}</span>
            ))}
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {holidays.map((h, i) => {
              const dayName = new Date(h.date).toLocaleDateString("en-IN", { weekday: "long" });
              const colorClass = DAY_COLORS[i % DAY_COLORS.length];
              return (
                <div key={h.id} className="group">
                  {/* Desktop row */}
                  <div className="hidden sm:grid grid-cols-[1fr_2fr_1fr_44px] px-5 py-4 gap-4 items-center hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                    <span className="text-sm font-semibold text-slate-900 dark:text-white">{formatDate(h.date)}</span>
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={cn("h-2 w-2 rounded-full shrink-0", colorClass.split(" ")[0])} />
                      <span className="text-sm text-slate-700 dark:text-slate-300 font-medium truncate">{h.name}</span>
                    </div>
                    <span className={cn("inline-flex text-xs font-semibold px-2.5 py-1 rounded-full w-fit", colorClass)}>
                      {dayName}
                    </span>
                    <button
                      onClick={() => handleDelete(h.id)}
                      disabled={deletingId === h.id}
                      className="h-8 w-8 flex items-center justify-center rounded-xl text-slate-300 dark:text-slate-600 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      {deletingId === h.id ? <WeaveSpinner className="animate-spin" size={14} /> : <Trash2 size={15} />}
                    </button>
                  </div>

                  {/* Mobile card */}
                  <div className="sm:hidden flex items-center justify-between px-4 py-4 gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={cn("h-9 w-9 rounded-xl flex items-center justify-center shrink-0 text-lg", colorClass)}>
                        🗓️
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{h.name}</p>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <span className="text-xs text-slate-500 dark:text-slate-400">{formatDate(h.date)}</span>
                          <span className={cn("inline-flex text-[10px] font-semibold px-2 py-0.5 rounded-full", colorClass)}>{dayName}</span>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDelete(h.id)}
                      disabled={deletingId === h.id}
                      className="h-8 w-8 flex items-center justify-center rounded-xl text-slate-300 dark:text-slate-600 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors shrink-0"
                    >
                      {deletingId === h.id ? <WeaveSpinner className="animate-spin" size={14} /> : <Trash2 size={15} />}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
