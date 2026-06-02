"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Shield, ShieldOff, UserPlus, AlertTriangle, Crown, Mail, Hash } from "lucide-react";
import api from "@/lib/api";
import { WeaveSpinner } from "@/components/ui/weave-spinner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface AdminUser {
  id: string;
  email: string;
  role: string;
  employee?: {
    id: string;
    fullName: string;
    employeeId: string;
    department?: string;
    designation?: string;
  };
}

interface Candidate {
  id: string;
  email: string;
  employee?: {
    id: string;
    fullName: string;
    employeeId: string;
  };
}

const AVATAR_COLORS = [
  "bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300",
  "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300",
  "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300",
  "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300",
  "bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300",
  "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300",
];

export default function AdminsPage() {
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [demotingId, setDemotingId] = useState<string | null>(null);

  const fetchAdmins = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/admin/admins");
      setAdmins(res.data);
    } catch {
      toast.error("Failed to load admins");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAdmins(); }, [fetchAdmins]);

  const handleOpenAddModal = async () => {
    setShowAddModal(true);
    setSelectedCandidate("");
    if (candidates.length === 0) {
      setLoadingCandidates(true);
      try {
        const res = await api.get("/admin/admins/candidates");
        setCandidates(res.data);
      } catch {
        toast.error("Failed to load candidates");
      } finally {
        setLoadingCandidates(false);
      }
    }
  };

  const handlePromote = async () => {
    if (!selectedCandidate) { toast.error("Please select an employee"); return; }
    setSubmitting(true);
    try {
      const res = await api.post("/admin/admins/promote", { userId: selectedCandidate });
      toast.success(res.data.message);
      setShowAddModal(false);
      fetchAdmins();
      setCandidates((prev) => prev.filter((c) => c.id !== selectedCandidate));
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to promote admin");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDemote = async (userId: string, name: string) => {
    if (!confirm(`Revoke Admin access for ${name}?`)) return;
    setDemotingId(userId);
    try {
      const res = await api.post("/admin/admins/demote", { userId });
      toast.success(res.data.message);
      fetchAdmins();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to demote admin");
    } finally {
      setDemotingId(null);
    }
  };

  return (
    <div className="w-full max-w-4xl space-y-4">
      {/* Page Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/10 via-indigo-400/5 to-transparent border border-primary/10 dark:border-primary/20 p-5">
        <div className="relative flex items-start gap-3 flex-wrap">
          {/* Left: icon + text */}
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="h-10 w-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
              <Crown className="text-primary" size={20} />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-heading font-bold text-slate-900 dark:text-white leading-tight">Manage Admins</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                View current admins and promote employees to admin role.
              </p>
            </div>
          </div>
          {/* Button — never wraps awkwardly */}
          <button
            onClick={handleOpenAddModal}
            className="flex items-center gap-2 h-9 px-4 rounded-xl bg-primary text-white text-sm font-semibold shadow-sm shadow-primary/30 hover:bg-primary/90 transition-all shrink-0"
          >
            <UserPlus size={15} />
            <span className="hidden xs:inline">Add Admin</span>
            <span className="xs:hidden">Add</span>
          </button>
        </div>
        <div className="absolute -right-6 -top-6 h-28 w-28 rounded-full bg-primary/5 blur-2xl pointer-events-none" />
      </div>

      {/* Stats */}
      <div className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm w-fit text-sm">
        <Shield size={14} className="text-primary" />
        <span className="font-semibold text-slate-900 dark:text-white">{admins.length}</span>
        <span className="text-slate-500 dark:text-slate-400">admin{admins.length !== 1 ? "s" : ""} with access</span>
      </div>

      {/* Admin cards */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <WeaveSpinner className="animate-spin text-primary" size={28} />
          <p className="text-sm text-slate-500">Loading admins…</p>
        </div>
      ) : admins.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-slate-900 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
          <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Shield size={24} className="text-primary opacity-50" />
          </div>
          <p className="font-medium text-slate-700 dark:text-slate-300">No admins found</p>
          <p className="text-sm text-slate-400 mt-1">Promote an employee to grant admin access.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {admins.map((admin, i) => {
            const name = admin.employee?.fullName || "System Admin";
            const initials = name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
            const avatarColor = AVATAR_COLORS[i % AVATAR_COLORS.length];
            const isSuperAdmin = admin.role === "SUPER_ADMIN";
            return (
              <div
                key={admin.id}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm hover:shadow-md transition-all group"
              >
                <div className="flex items-start gap-3">
                  {/* Avatar */}
                  <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center shrink-0 text-sm font-bold", avatarColor)}>
                    {initials}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h4 className="font-semibold text-slate-900 dark:text-white text-sm leading-tight truncate">{name}</h4>
                          {isSuperAdmin && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-semibold shrink-0">
                              <Crown size={8} /> Super
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 mt-0.5">
                          <Mail size={11} className="text-slate-400 shrink-0" />
                          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{admin.email}</p>
                        </div>
                      </div>
                      {/* Demote button */}
                      {!isSuperAdmin && (
                        <button
                          onClick={() => handleDemote(admin.id, name)}
                          disabled={demotingId === admin.id}
                          title="Revoke Admin Access"
                          className="h-7 w-7 flex items-center justify-center rounded-lg text-slate-300 dark:text-slate-600 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors opacity-0 group-hover:opacity-100 shrink-0"
                        >
                          {demotingId === admin.id
                            ? <WeaveSpinner className="animate-spin" size={13} />
                            : <ShieldOff size={14} />}
                        </button>
                      )}
                    </div>

                    {admin.employee && (
                      <div className="flex gap-1.5 mt-2 flex-wrap">
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                          <Hash size={8} />{admin.employee.employeeId}
                        </span>
                        {admin.employee.department && (
                          <span className="inline-flex text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                            {admin.employee.department}
                          </span>
                        )}
                        {admin.employee.designation && (
                          <span className="inline-flex text-[10px] font-semibold px-2 py-0.5 rounded-full bg-violet-50 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400">
                            {admin.employee.designation}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Admin Dialog */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus size={18} className="text-primary" />
              Promote Employee to Admin
            </DialogTitle>
          </DialogHeader>

          <div className="py-4 space-y-4">
            <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50">
              <AlertTriangle size={15} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs leading-relaxed text-amber-700 dark:text-amber-400">
                Promoted employees will gain full access to the Admin Dashboard and all organization settings.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Select Employee</label>
              {loadingCandidates ? (
                <div className="h-11 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-900 flex items-center justify-center gap-2">
                  <WeaveSpinner className="animate-spin text-primary" size={16} />
                  <span className="text-sm text-slate-400">Loading employees…</span>
                </div>
              ) : (
                <select
                  value={selectedCandidate}
                  onChange={(e) => setSelectedCandidate(e.target.value)}
                  className="flex h-11 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                >
                  <option value="">— Choose an employee —</option>
                  {candidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.employee?.fullName} ({c.employee?.employeeId})
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <button
              onClick={() => setShowAddModal(false)}
              className="h-10 px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handlePromote}
              disabled={!selectedCandidate || submitting}
              className="h-10 px-5 rounded-xl bg-primary text-white text-sm font-semibold shadow-sm shadow-primary/30 hover:bg-primary/90 disabled:opacity-50 transition-all flex items-center gap-2"
            >
              {submitting && <WeaveSpinner className="animate-spin" size={14} />}
              Promote to Admin
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
