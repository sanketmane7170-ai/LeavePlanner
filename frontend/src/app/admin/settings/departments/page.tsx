"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Building2, Plus, Trash2, Hash } from "lucide-react";
import api from "@/lib/api";
import { WeaveSpinner } from "@/components/ui/weave-spinner";
import { cn } from "@/lib/utils";

interface Department {
  id: string;
  name: string;
}

const DEPT_COLORS = [
  "bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400",
  "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400",
  "bg-cyan-50 dark:bg-cyan-900/20 text-cyan-600 dark:text-cyan-400",
  "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400",
  "bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400",
  "bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400",
  "bg-pink-50 dark:bg-pink-900/20 text-pink-600 dark:text-pink-400",
  "bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400",
];

export default function DepartmentsPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(false);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchDepts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/admin/settings/departments");
      setDepartments(res.data);
    } catch {
      toast.error("Failed to load departments");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDepts(); }, [fetchDepts]);

  const handleAdd = async () => {
    if (!newName.trim()) { toast.error("Department name required"); return; }
    setAdding(true);
    try {
      await api.post("/admin/settings/departments", { name: newName.trim() });
      toast.success("Department added");
      setNewName("");
      fetchDepts();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to add department");
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this department?")) return;
    setDeletingId(id);
    try {
      await api.delete(`/admin/settings/departments/${id}`);
      toast.success("Department deleted");
      fetchDepts();
    } catch {
      toast.error("Failed to delete department");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="w-full max-w-3xl space-y-4">
      {/* Page Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-500/10 via-violet-400/5 to-transparent border border-violet-200/50 dark:border-violet-800/30 p-5">
        <div className="relative flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-violet-500/15 flex items-center justify-center shrink-0">
            <Building2 className="text-violet-600 dark:text-violet-400" size={20} />
          </div>
          <div>
            <h1 className="text-lg font-heading font-bold text-slate-900 dark:text-white leading-tight">Departments</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Manage the departments used when onboarding employees.
            </p>
          </div>
        </div>
        <div className="absolute -right-6 -top-6 h-28 w-28 rounded-full bg-violet-400/10 blur-2xl pointer-events-none" />
      </div>

      {/* Stats */}
      <div className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm w-fit text-sm">
        <Building2 size={14} className="text-violet-500" />
        <span className="font-semibold text-slate-900 dark:text-white">{departments.length}</span>
        <span className="text-slate-500 dark:text-slate-400">department{departments.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Add form */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-5">
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">Add Department</p>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Engineering, Design, Marketing"
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            className="flex-1 h-11 px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 transition-all"
          />
          <button
            onClick={handleAdd}
            disabled={adding}
            className="flex items-center justify-center gap-2 h-11 px-5 rounded-xl bg-primary text-white text-sm font-semibold shadow-sm shadow-primary/30 hover:bg-primary/90 disabled:opacity-60 transition-all shrink-0"
          >
            {adding ? <WeaveSpinner className="animate-spin" size={15} /> : <Plus size={15} />}
            Add
          </button>
        </div>
      </div>

      {/* Departments list */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <WeaveSpinner className="animate-spin text-primary" size={28} />
          <p className="text-sm text-slate-500">Loading departments…</p>
        </div>
      ) : departments.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-slate-900 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
          <div className="h-14 w-14 rounded-full bg-violet-50 dark:bg-violet-900/20 flex items-center justify-center mx-auto mb-4">
            <Building2 size={24} className="text-violet-400 opacity-60" />
          </div>
          <p className="font-medium text-slate-700 dark:text-slate-300">No departments yet</p>
          <p className="text-sm text-slate-400 mt-1">Add your first department using the form above.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {departments.map((dept, i) => {
            const color = DEPT_COLORS[i % DEPT_COLORS.length];
            const initials = dept.name.slice(0, 2).toUpperCase();
            return (
              <div
                key={dept.id}
                className="flex items-center justify-between bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 px-4 py-3.5 shadow-sm hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700 transition-all group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center shrink-0 text-xs font-bold", color)}>
                    {initials}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{dept.name}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <Hash size={10} className="text-slate-400 shrink-0" />
                      <span className="text-[11px] text-slate-400 font-mono">{dept.id.slice(-6)}</span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(dept.id)}
                  disabled={deletingId === dept.id}
                  className="h-8 w-8 flex items-center justify-center rounded-xl text-slate-300 dark:text-slate-600 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors opacity-0 group-hover:opacity-100 shrink-0 ml-2"
                  title="Delete department"
                >
                  {deletingId === dept.id ? <WeaveSpinner className="animate-spin" size={14} /> : <Trash2 size={15} />}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
