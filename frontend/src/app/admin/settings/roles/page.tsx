"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Briefcase, Plus, Trash2, Hash } from "lucide-react";
import api from "@/lib/api";
import { WeaveSpinner } from "@/components/ui/weave-spinner";
import { cn } from "@/lib/utils";

interface EmployeeRole {
  id: string;
  name: string;
}

const ROLE_COLORS = [
  "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400",
  "bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400",
  "bg-sky-50 dark:bg-sky-900/20 text-sky-600 dark:text-sky-400",
  "bg-teal-50 dark:bg-teal-900/20 text-teal-600 dark:text-teal-400",
  "bg-cyan-50 dark:bg-cyan-900/20 text-cyan-600 dark:text-cyan-400",
  "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400",
  "bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400",
  "bg-fuchsia-50 dark:bg-fuchsia-900/20 text-fuchsia-600 dark:text-fuchsia-400",
];

export default function RolesPage() {
  const [roles, setRoles] = useState<EmployeeRole[]>([]);
  const [loading, setLoading] = useState(false);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchRoles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/admin/settings/roles");
      setRoles(res.data);
    } catch {
      toast.error("Failed to load roles");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRoles(); }, [fetchRoles]);

  const handleAdd = async () => {
    if (!newName.trim()) { toast.error("Role name required"); return; }
    setAdding(true);
    try {
      await api.post("/admin/settings/roles", { name: newName.trim() });
      toast.success("Role added");
      setNewName("");
      fetchRoles();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to add role");
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this role?")) return;
    setDeletingId(id);
    try {
      await api.delete(`/admin/settings/roles/${id}`);
      toast.success("Role deleted");
      fetchRoles();
    } catch {
      toast.error("Failed to delete role");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="w-full max-w-3xl space-y-4">
      {/* Page Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-500/10 via-indigo-400/5 to-transparent border border-blue-200/50 dark:border-blue-800/30 p-5">
        <div className="relative flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-blue-500/15 flex items-center justify-center shrink-0">
            <Briefcase className="text-blue-600 dark:text-blue-400" size={20} />
          </div>
          <div>
            <h1 className="text-lg font-heading font-bold text-slate-900 dark:text-white leading-tight">Roles & Designations</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Manage job roles and designations assigned to employees.
            </p>
          </div>
        </div>
        <div className="absolute -right-6 -top-6 h-28 w-28 rounded-full bg-blue-400/10 blur-2xl pointer-events-none" />
      </div>

      {/* Stats */}
      <div className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm w-fit text-sm">
        <Briefcase size={14} className="text-blue-500" />
        <span className="font-semibold text-slate-900 dark:text-white">{roles.length}</span>
        <span className="text-slate-500 dark:text-slate-400">role{roles.length !== 1 ? "s" : ""} defined</span>
      </div>

      {/* Add form */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-5">
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">Add Role</p>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Software Engineer, Product Manager"
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

      {/* Roles list */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <WeaveSpinner className="animate-spin text-primary" size={28} />
          <p className="text-sm text-slate-500">Loading roles…</p>
        </div>
      ) : roles.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-slate-900 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
          <div className="h-14 w-14 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center mx-auto mb-4">
            <Briefcase size={24} className="text-blue-400 opacity-60" />
          </div>
          <p className="font-medium text-slate-700 dark:text-slate-300">No roles yet</p>
          <p className="text-sm text-slate-400 mt-1">Add your first role using the form above.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {roles.map((role, i) => {
            const color = ROLE_COLORS[i % ROLE_COLORS.length];
            const initials = role.name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
            return (
              <div
                key={role.id}
                className="flex items-center justify-between bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 px-4 py-3.5 shadow-sm hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700 transition-all group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center shrink-0 text-xs font-bold", color)}>
                    {initials}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{role.name}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <Hash size={10} className="text-slate-400 shrink-0" />
                      <span className="text-[11px] text-slate-400 font-mono">{role.id.slice(-6)}</span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(role.id)}
                  disabled={deletingId === role.id}
                  className="h-8 w-8 flex items-center justify-center rounded-xl text-slate-300 dark:text-slate-600 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors opacity-0 group-hover:opacity-100 shrink-0 ml-2"
                  title="Delete role"
                >
                  {deletingId === role.id ? <WeaveSpinner className="animate-spin" size={14} /> : <Trash2 size={15} />}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
