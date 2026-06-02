"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { MessageSquare, CheckCircle2, Circle, Clock, Mail, Phone, CalendarDays } from "lucide-react";
import api from "@/lib/api";
import { WeaveSpinner } from "@/components/ui/weave-spinner";
import { cn, formatDate } from "@/lib/utils";

interface SupportTicket {
  id: string;
  name: string;
  email: string;
  mobile: string | null;
  reason: string;
  status: "OPEN" | "RESOLVED";
  createdAt: string;
}

export default function AdminSupportPage() {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/admin/support");
      setTickets(res.data);
    } catch {
      toast.error("Failed to load support tickets");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  const handleResolve = async (id: string) => {
    setResolvingId(id);
    try {
      await api.patch(`/admin/support/${id}/resolve`);
      toast.success("Ticket marked as resolved!");
      fetchTickets();
    } catch {
      toast.error("Failed to resolve ticket");
    } finally {
      setResolvingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-heading font-bold text-slate-900 dark:text-white">
          Support Requests
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Manage contact requests from users who are having trouble accessing their accounts.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <WeaveSpinner className="animate-spin text-primary" size={28} />
        </div>
      ) : tickets.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="h-16 w-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <MessageSquare size={28} className="text-slate-400" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">All caught up!</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            No support requests are pending.
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {tickets.map((ticket) => (
            <div
              key={ticket.id}
              className={cn(
                "bg-white dark:bg-slate-900 rounded-2xl border p-5 sm:p-6 transition-all",
                ticket.status === "OPEN"
                  ? "border-amber-200 dark:border-amber-900/50 shadow-sm"
                  : "border-slate-200 dark:border-slate-800 opacity-75"
              )}
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div className="space-y-4 flex-1">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "px-2.5 py-1 rounded-full text-xs font-bold tracking-wider",
                      ticket.status === "OPEN"
                        ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                        : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                    )}>
                      {ticket.status}
                    </div>
                    <span className="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                      <CalendarDays size={14} />
                      {formatDate(ticket.createdAt)}
                    </span>
                  </div>

                  <div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                      {ticket.name}
                    </h3>
                    <div className="flex flex-wrap items-center gap-4 mt-2">
                      <a href={`mailto:${ticket.email}`} className="text-sm text-blue-600 hover:underline flex items-center gap-1.5">
                        <Mail size={14} />
                        {ticket.email}
                      </a>
                      {ticket.mobile && (
                        <a href={`tel:${ticket.mobile}`} className="text-sm text-slate-600 dark:text-slate-400 hover:underline flex items-center gap-1.5">
                          <Phone size={14} />
                          {ticket.mobile}
                        </a>
                      )}
                    </div>
                  </div>

                  <div className="bg-slate-50 dark:bg-slate-950/50 rounded-xl p-4 border border-slate-100 dark:border-slate-800">
                    <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                      {ticket.reason}
                    </p>
                  </div>
                </div>

                <div className="shrink-0 flex items-center sm:items-start justify-end">
                  {ticket.status === "OPEN" ? (
                    <button
                      onClick={() => handleResolve(ticket.id)}
                      disabled={resolvingId === ticket.id}
                      className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
                    >
                      {resolvingId === ticket.id ? (
                        <WeaveSpinner className="animate-spin" size={16} />
                      ) : (
                        <CheckCircle2 size={16} />
                      )}
                      Mark as Resolved
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-xl text-sm font-medium cursor-default">
                      <CheckCircle2 size={16} />
                      Resolved
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
