"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  Plus,
  Pencil,
  Trash2,
  Megaphone,
  Calendar,
  X,
  AlertCircle,
  Clock,
  Sparkles,
} from "lucide-react";
import api from "@/lib/api";
import type { Announcement, AnnouncementPriority } from "@/types";
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

// ── Schema ────────────────────────────────────────────────────────────────────
const announcementSchema = z.object({
  title: z.string().min(2, "At least 2 characters"),
  content: z.string().min(5, "At least 5 characters"),
  priority: z.enum(["HIGH", "MEDIUM", "LOW"]),
  scheduledAt: z.string().optional().or(z.literal("")),
  expiresAt: z.string().optional().or(z.literal("")),
  isActive: z.boolean(),
});
type AnnouncementFormValues = z.infer<typeof announcementSchema>;

// ── Toggle Helper ─────────────────────────────────────────────────────────────
function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-slate-100 dark:border-slate-800 last:border-0">
      <div>
        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{label}</p>
        {description && (
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{description}</p>
        )}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40",
          checked ? "bg-primary" : "bg-slate-200 dark:bg-slate-700"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200",
            checked ? "translate-x-5" : "translate-x-0.5"
          )}
        />
      </button>
    </div>
  );
}

export default function AdminAnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState<Announcement | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AnnouncementFormValues>({
    resolver: zodResolver(announcementSchema),
    defaultValues: {
      title: "",
      content: "",
      priority: "MEDIUM",
      scheduledAt: "",
      expiresAt: "",
      isActive: true,
    },
  });

  const isActiveValue = watch("isActive");

  // Fetch announcements
  const fetchAnnouncements = () => {
    setLoading(true);
    api
      .get("/admin/announcements")
      .then((res) => setAnnouncements(res.data))
      .catch(() => toast.error("Failed to load announcements"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchAnnouncements();
  }, []);

  // Form submit
  const onSubmit = async (values: AnnouncementFormValues) => {
    try {
      const payload = {
        ...values,
        scheduledAt: values.scheduledAt ? new Date(values.scheduledAt).toISOString() : null,
        expiresAt: values.expiresAt ? new Date(values.expiresAt).toISOString() : null,
      };

      if (editingAnnouncement) {
        await api.put(`/admin/announcements/${editingAnnouncement.id}`, payload);
        toast.success("Announcement updated successfully");
      } else {
        await api.post("/admin/announcements", payload);
        toast.success("Announcement created successfully");
      }
      setDialogOpen(false);
      fetchAnnouncements();
    } catch {
      toast.error("Failed to save announcement");
    }
  };

  // Open create dialog
  const handleNewAnnouncement = () => {
    setEditingAnnouncement(null);
    reset({
      title: "",
      content: "",
      priority: "MEDIUM",
      scheduledAt: "",
      expiresAt: "",
      isActive: true,
    });
    setDialogOpen(true);
  };

  // Open edit dialog
  const handleEdit = (ann: Announcement) => {
    setEditingAnnouncement(ann);
    reset({
      title: ann.title,
      content: ann.content,
      priority: ann.priority,
      scheduledAt: ann.scheduledAt ? new Date(ann.scheduledAt).toISOString().slice(0, 16) : "",
      expiresAt: ann.expiresAt ? new Date(ann.expiresAt).toISOString().slice(0, 16) : "",
      isActive: ann.isActive,
    });
    setDialogOpen(true);
  };

  // Handle delete
  const handleDeleteConfirm = async () => {
    if (!deleteId) return;
    try {
      await api.delete(`/admin/announcements/${deleteId}`);
      toast.success("Announcement deleted successfully");
      setDeleteId(null);
      fetchAnnouncements();
    } catch {
      toast.error("Failed to delete announcement");
    }
  };

  const getStatusBadge = (ann: Announcement) => {
    if (!ann.isActive) {
      return (
        <span className="text-[10px] font-medium px-2 py-0.5 bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 rounded-full">
          Draft/Inactive
        </span>
      );
    }

    const now = new Date();
    if (ann.expiresAt && new Date(ann.expiresAt) < now) {
      return (
        <span className="text-[10px] font-medium px-2 py-0.5 bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400 rounded-full">
          Expired
        </span>
      );
    }

    if (ann.scheduledAt && new Date(ann.scheduledAt) > now) {
      return (
        <span className="text-[10px] font-medium px-2 py-0.5 bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400 rounded-full">
          Scheduled
        </span>
      );
    }

    return (
      <span className="text-[10px] font-medium px-2 py-0.5 bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400 rounded-full">
        Active
      </span>
    );
  };

  const getPriorityBadgeColor = (priority: AnnouncementPriority) => {
    switch (priority) {
      case "HIGH":
        return "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/20 dark:text-rose-400 dark:border-rose-900/40";
      case "MEDIUM":
        return "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/20 dark:text-blue-400 dark:border-blue-900/40";
      case "LOW":
        return "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900 dark:text-slate-400 dark:border-slate-800";
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold font-heading text-slate-950 dark:text-white">
            Announcements Manager
          </h2>
          <p className="text-xs text-slate-500 mt-1 dark:text-slate-400">
            Publish, schedule, and prioritize company-wide announcements and birthday wishes.
          </p>
        </div>
        <Button onClick={handleNewAnnouncement}>
          <Plus size={16} className="mr-1.5" />
          Create Announcement
        </Button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <WeaveSpinner size={32} className="animate-spin text-primary" />
          <p className="text-xs text-slate-400 mt-3">Loading announcements...</p>
        </div>
      ) : announcements.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-12 text-center max-w-xl mx-auto shadow-sm">
          <Megaphone size={36} className="mx-auto text-slate-300 mb-4 dark:text-slate-700" />
          <h3 className="font-heading font-semibold text-slate-900 dark:text-white text-base">
            No Announcements Found
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Create a new announcement to notify employees on their dashboard.
          </p>
          <Button className="mt-4" onClick={handleNewAnnouncement}>
            <Plus size={16} className="mr-1.5" /> Create Announcement
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {announcements.map((ann) => (
            <div
              key={ann.id}
              className={cn(
                "bg-white dark:bg-slate-900 border rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between relative overflow-hidden",
                ann.priority === "HIGH"
                  ? "border-rose-100 dark:border-rose-950/40"
                  : "border-slate-200 dark:border-slate-800"
              )}
            >
              {/* Top Row: Priorities & Statuses */}
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      "text-[10px] font-semibold border px-2 py-0.5 rounded-full uppercase tracking-wider",
                      getPriorityBadgeColor(ann.priority)
                    )}
                  >
                    {ann.priority}
                  </span>
                  {getStatusBadge(ann)}
                  {ann.isBirthday && (
                    <span className="text-[10px] font-medium px-2 py-0.5 bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400 rounded-full flex items-center gap-1">
                      <Sparkles size={10} /> Birthday Wish
                    </span>
                  )}
                </div>
                {!ann.isBirthday && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleEdit(ann)}
                      className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => setDeleteId(ann.id)}
                      className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/20 text-slate-500 hover:text-red-500"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>

              {/* Title & Body */}
              <div className="mb-4">
                <h3 className="font-heading font-bold text-slate-900 dark:text-white text-base">
                  {ann.title}
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-2 whitespace-pre-wrap leading-relaxed">
                  {ann.content}
                </p>
              </div>

              {/* Expiry / Schedule info */}
              <div className="border-t border-slate-100 dark:border-slate-800 pt-3 flex items-center justify-between text-[10px] text-slate-400 mt-auto">
                <div className="flex items-center gap-1">
                  <Calendar size={11} />
                  <span>
                    Created: {new Date(ann.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  {ann.scheduledAt && (
                    <div className="flex items-center gap-1">
                      <Clock size={11} />
                      <span>
                        Sched: {new Date(ann.scheduledAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                      </span>
                    </div>
                  )}
                  {ann.expiresAt && (
                    <div className="flex items-center gap-1">
                      <AlertCircle size={11} />
                      <span>
                        Exp: {new Date(ann.expiresAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingAnnouncement ? "Edit Announcement" : "Create Announcement"}
            </DialogTitle>
            <DialogDescription>
              {editingAnnouncement
                ? "Modify your announcement details below."
                : "Fill out the details below to publish a new announcement."}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-2">
            <Input
              label="Announcement Title *"
              error={errors.title?.message}
              {...register("title")}
            />

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Announcement Content *
              </label>
              <textarea
                rows={4}
                className={cn(
                  "flex w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/50",
                  errors.content && "border-red-500"
                )}
                placeholder="Enter details..."
                {...register("content")}
              />
              {errors.content && (
                <p className="text-xs text-red-500 mt-1">{errors.content.message}</p>
              )}
            </div>

            <Select label="Priority *" {...register("priority")}>
              <option value="LOW">Low Priority (General info)</option>
              <option value="MEDIUM">Medium Priority (Standard updates)</option>
              <option value="HIGH">High Priority (Urgent news)</option>
            </Select>

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Scheduled Date"
                type="datetime-local"
                error={errors.scheduledAt?.message}
                {...register("scheduledAt")}
              />
              <Input
                label="Expiry Date"
                type="datetime-local"
                error={errors.expiresAt?.message}
                {...register("expiresAt")}
              />
            </div>

            <div className="bg-slate-50 dark:bg-slate-900 px-3 rounded-xl border border-slate-200 dark:border-slate-800">
              <Toggle
                checked={isActiveValue}
                onChange={(val) => setValue("isActive", val)}
                label="Active Status"
                description="If inactive, the announcement is saved as draft and won't show to employees."
              />
            </div>

            <DialogFooter className="mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <WeaveSpinner size={16} className="animate-spin mr-1.5" />
                ) : null}
                {editingAnnouncement ? "Save Changes" : "Publish"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="max-w-sm text-center">
          <div className="mx-auto h-12 w-12 rounded-full bg-red-50 dark:bg-red-950/20 text-red-600 flex items-center justify-center mb-4">
            <Trash2 size={22} />
          </div>
          <DialogHeader>
            <DialogTitle className="text-center">Delete Announcement?</DialogTitle>
            <DialogDescription className="text-center">
              Are you sure you want to delete this announcement? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="grid grid-cols-2 gap-2 mt-4">
            <Button variant="outline" onClick={() => setDeleteId(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteConfirm}>
              Yes, Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
