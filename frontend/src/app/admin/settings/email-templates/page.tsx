"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Eye, Pencil, RotateCcw, Save, X, Mail, ChevronDown,
  ChevronUp, ShieldCheck, User, Loader2, RefreshCw, Copy,
} from "lucide-react";
import api from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

// ── Types ─────────────────────────────────────────────────────────────────────

interface TemplateVariable {
  name: string;
  description: string;
  example: string;
}

interface EmailTemplate {
  id: string;
  key: string;
  name: string;
  description: string;
  category: "ADMIN" | "EMPLOYEE";
  subject: string;
  bodyHtml: string;
  variables: TemplateVariable[];
  isActive: boolean;
  updatedAt: string;
}

// ── Base email wrapper for preview ────────────────────────────────────────────

// Templates are self-contained (include their own header/footer). Just add DOCTYPE shell.
function buildPreviewHtml(_orgName: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;">${body}</body>
</html>`;
}

function interpolate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
}

function buildSampleVars(variables: TemplateVariable[], orgName: string): Record<string, string> {
  const map: Record<string, string> = { orgName };
  for (const v of variables) map[v.name] = v.example;
  return map;
}

// ── Preview iframe ────────────────────────────────────────────────────────────

function PreviewFrame({ subject, bodyHtml, variables }: { subject: string; bodyHtml: string; variables: TemplateVariable[] }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const orgName = "Innovizia";

  useEffect(() => {
    const sampleVars = buildSampleVars(variables, orgName);
    const renderedBody = interpolate(bodyHtml, sampleVars);
    const renderedSubject = interpolate(subject, sampleVars);
    const fullHtml = buildPreviewHtml(orgName, renderedBody);

    if (iframeRef.current) {
      iframeRef.current.srcdoc = fullHtml;
      iframeRef.current.title = renderedSubject;
    }
  }, [subject, bodyHtml, variables]);

  return (
    <iframe
      ref={iframeRef}
      className="w-full border-0"
      style={{ height: "600px" }}
      sandbox="allow-same-origin"
    />
  );
}

// ── Preview Modal ─────────────────────────────────────────────────────────────

function PreviewModal({ template, onClose }: { template: EmailTemplate; onClose: () => void }) {
  const sampleVars = buildSampleVars(template.variables, "Innovizia");
  const renderedSubject = interpolate(template.subject, sampleVars);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-3xl my-8">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="min-w-0">
            <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide font-semibold mb-0.5">Email Preview</p>
            <h3 className="font-semibold text-slate-900 dark:text-white truncate">{template.name}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
              Subject: <span className="text-slate-700 dark:text-slate-300">{renderedSubject}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="ml-4 p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-700 dark:hover:text-white transition-colors shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        {/* Sample data notice */}
        <div className="px-6 py-3 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800 flex items-center gap-2">
          <Eye size={14} className="text-amber-600 dark:text-amber-400 shrink-0" />
          <p className="text-xs text-amber-700 dark:text-amber-300">
            Rendered with sample data — actual emails use real employee information
          </p>
        </div>

        {/* Preview */}
        <div className="rounded-b-2xl overflow-hidden bg-slate-100 dark:bg-slate-950">
          <PreviewFrame subject={template.subject} bodyHtml={template.bodyHtml} variables={template.variables} />
        </div>
      </div>
    </div>
  );
}

// ── Edit Modal ────────────────────────────────────────────────────────────────

function EditModal({
  template,
  onClose,
  onSaved,
}: {
  template: EmailTemplate;
  onClose: () => void;
  onSaved: (updated: EmailTemplate) => void;
}) {
  const [subject, setSubject]   = useState(template.subject);
  const [bodyHtml, setBodyHtml] = useState(template.bodyHtml);
  const [saving, setSaving]     = useState(false);
  const [resetting, setResetting] = useState(false);
  const [showVars, setShowVars] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  const previewTimer = useRef<ReturnType<typeof setTimeout>>();

  // Debounced preview update
  const handleBodyChange = (val: string) => {
    setBodyHtml(val);
    clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(() => setPreviewKey((k) => k + 1), 400);
  };

  const handleSave = async () => {
    if (!subject.trim()) { toast.error("Subject cannot be empty"); return; }
    if (!bodyHtml.trim()) { toast.error("Body HTML cannot be empty"); return; }
    setSaving(true);
    try {
      const res = await api.put(`/admin/settings/email-templates/${template.key}`, {
        subject: subject.trim(),
        bodyHtml: bodyHtml.trim(),
      });
      toast.success("Template saved");
      onSaved(res.data.template);
    } catch (e: any) {
      toast.error(e.response?.data?.message || "Failed to save template");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirm("Reset this template to factory defaults? Your edits will be lost.")) return;
    setResetting(true);
    try {
      const res = await api.post(`/admin/settings/email-templates/${template.key}/reset`);
      setSubject(res.data.template.subject);
      setBodyHtml(res.data.template.bodyHtml);
      setPreviewKey((k) => k + 1);
      toast.success("Template reset to default");
    } catch (e: any) {
      toast.error(e.response?.data?.message || "Failed to reset template");
    } finally {
      setResetting(false);
    }
  };

  const insertVariable = (name: string) => {
    const tag = `{{${name}}}`;
    const textarea = document.getElementById("bodyEditor") as HTMLTextAreaElement | null;
    if (textarea) {
      const start = textarea.selectionStart ?? bodyHtml.length;
      const end   = textarea.selectionEnd   ?? bodyHtml.length;
      const newVal = bodyHtml.slice(0, start) + tag + bodyHtml.slice(end);
      setBodyHtml(newVal);
      setPreviewKey((k) => k + 1);
      setTimeout(() => {
        textarea.focus();
        textarea.selectionStart = textarea.selectionEnd = start + tag.length;
      }, 0);
    }
  };

  const copyVariable = (name: string) => {
    navigator.clipboard.writeText(`{{${name}}}`);
    toast.success(`Copied {{${name}}}`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-stretch bg-black/50 backdrop-blur-sm">
      <div className="m-auto w-full max-w-[1200px] h-[95vh] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide font-semibold mb-0.5">Editing Template</p>
            <h3 className="font-semibold text-slate-900 dark:text-white">{template.name}</h3>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              disabled={resetting || saving}
              className="text-slate-600 dark:text-slate-400"
            >
              {resetting ? <Loader2 size={13} className="animate-spin mr-1.5" /> : <RotateCcw size={13} className="mr-1.5" />}
              Reset to Default
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving || resetting}>
              {saving ? <Loader2 size={13} className="animate-spin mr-1.5" /> : <Save size={13} className="mr-1.5" />}
              Save
            </Button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content — split */}
        <div className="flex flex-1 min-h-0">

          {/* Left — Editor */}
          <div className="flex flex-col w-[55%] border-r border-slate-200 dark:border-slate-800 overflow-y-auto">
            <div className="p-5 space-y-4">

              {/* Subject */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">
                  Subject Line
                </label>
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full h-10 px-3 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono"
                  placeholder="Email subject..."
                />
              </div>

              {/* Body HTML */}
              <div className="flex flex-col">
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">
                  Body HTML
                </label>
                <textarea
                  id="bodyEditor"
                  value={bodyHtml}
                  onChange={(e) => handleBodyChange(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-950 text-green-400 font-mono text-[12px] leading-relaxed p-4 focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                  style={{ minHeight: "320px" }}
                  spellCheck={false}
                />
              </div>

              {/* Variables panel */}
              <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                <button
                  onClick={() => setShowVars((v) => !v)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wide">
                    Available Variables ({template.variables.length})
                  </span>
                  {showVars ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
                </button>

                {showVars && (
                  <div className="border-t border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
                    {template.variables.map((v) => (
                      <div key={v.name} className="flex items-start gap-3 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <code className="text-[11px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-mono">{`{{${v.name}}}`}</code>
                            <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{v.description}</span>
                          </div>
                          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 truncate">{typeof v.example === 'string' && v.example.startsWith('<') ? '[HTML element]' : v.example}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => copyVariable(v.name)}
                            title="Copy variable tag"
                            className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                          >
                            <Copy size={11} />
                          </button>
                          <button
                            onClick={() => insertVariable(v.name)}
                            title="Insert at cursor"
                            className="px-2 py-1 rounded text-[11px] font-medium bg-primary/10 text-primary hover:bg-primary hover:text-white transition-colors"
                          >
                            Insert
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          </div>

          {/* Right — Live preview */}
          <div className="flex flex-col w-[45%] overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Live Preview</span>
              <span className="text-[11px] text-slate-400 dark:text-slate-500">Sample data • updates as you type</span>
            </div>
            <div className="flex-1 overflow-y-auto bg-slate-100 dark:bg-slate-950">
              <PreviewFrame
                key={previewKey}
                subject={subject}
                bodyHtml={bodyHtml}
                variables={template.variables}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Template card ─────────────────────────────────────────────────────────────

function TemplateCard({
  template,
  onPreview,
  onEdit,
}: {
  template: EmailTemplate;
  onPreview: () => void;
  onEdit: () => void;
}) {
  const isAdmin = template.category === "ADMIN";

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex flex-col gap-3 hover:shadow-md transition-shadow">
      {/* Top row */}
      <div className="flex items-start justify-between gap-2">
        <div className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: isAdmin ? '#eff6ff' : '#f0fdf4' }}>
          {isAdmin
            ? <ShieldCheck size={17} style={{ color: '#2563EB' }} />
            : <User size={17} style={{ color: '#16a34a' }} />}
        </div>
        <span className={cn(
          "text-[11px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide",
          isAdmin
            ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
            : "bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400"
        )}>
          {isAdmin ? "Admin" : "Employee"}
        </span>
      </div>

      {/* Name + description */}
      <div className="flex-1">
        <h4 className="text-sm font-semibold text-slate-900 dark:text-white leading-snug mb-1">{template.name}</h4>
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{template.description}</p>
      </div>

      {/* Subject preview */}
      <div className="bg-slate-50 dark:bg-slate-800 rounded-lg px-3 py-2">
        <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wide font-semibold mb-0.5">Subject</p>
        <p className="text-[11px] text-slate-600 dark:text-slate-300 font-mono truncate">{template.subject}</p>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-1">
        <span className="text-[10px] text-slate-400 dark:text-slate-500">
          {template.variables.length} variable{template.variables.length !== 1 ? "s" : ""}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={onPreview}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors border border-slate-200 dark:border-slate-700"
          >
            <Eye size={12} /> Preview
          </button>
          <button
            onClick={onEdit}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-primary text-white hover:bg-primary/90 transition-colors"
          >
            <Pencil size={12} /> Edit
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function EmailTemplatesPage() {
  const [templates, setTemplates]       = useState<EmailTemplate[]>([]);
  const [loading, setLoading]           = useState(true);
  const [filter, setFilter]             = useState<"ALL" | "ADMIN" | "EMPLOYEE">("ALL");
  const [previewing, setPreviewing]     = useState<EmailTemplate | null>(null);
  const [editing, setEditing]           = useState<EmailTemplate | null>(null);
  const [resetAllBusy, setResetAllBusy] = useState(false);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/admin/settings/email-templates");
      setTemplates(res.data);
    } catch {
      toast.error("Failed to load email templates");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  const handleSaved = (updated: EmailTemplate) => {
    setTemplates((prev) => prev.map((t) => (t.key === updated.key ? updated : t)));
    setEditing(updated);
  };

  const handleResetAll = async () => {
    if (!confirm("Reset ALL templates to factory defaults? Any customisations will be lost.")) return;
    setResetAllBusy(true);
    try {
      await api.post("/admin/settings/email-templates/reset-all");
      toast.success("All templates reset to defaults");
      fetchTemplates();
    } catch {
      toast.error("Failed to reset templates");
    } finally {
      setResetAllBusy(false);
    }
  };

  const visible = filter === "ALL"
    ? templates
    : templates.filter((t) => t.category === filter);

  const adminCount    = templates.filter((t) => t.category === "ADMIN").length;
  const employeeCount = templates.filter((t) => t.category === "EMPLOYEE").length;

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Page Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/10 via-blue-400/5 to-transparent border border-primary/10 dark:border-primary/20 p-6">
        <div className="relative flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 rounded-2xl bg-primary/15 flex items-center justify-center shrink-0">
              <Mail className="text-primary" size={24} />
            </div>
            <div>
              <h1 className="text-xl font-heading font-bold text-slate-900 dark:text-white">Email Templates</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                Customise email notifications sent to admins and employees.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchTemplates}
              disabled={loading}
              title="Refresh"
              className="h-9 w-9 flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500 transition-colors shadow-sm"
            >
              <RefreshCw size={14} className={cn(loading && "animate-spin")} />
            </button>
            <button
              onClick={handleResetAll}
              disabled={resetAllBusy || loading}
              className="flex items-center gap-1.5 h-9 px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors shadow-sm"
            >
              {resetAllBusy
                ? <Loader2 size={13} className="animate-spin" />
                : <RotateCcw size={13} />}
              Reset All
            </button>
          </div>
        </div>
        <div className="absolute -right-6 -top-6 h-32 w-32 rounded-full bg-primary/5 blur-2xl pointer-events-none" />
      </div>

      {/* Stats row */}
      <div className="flex gap-3 flex-wrap">
        {[
          { label: "Total templates", count: templates.length, color: "text-primary bg-primary/10" },
          { label: "Admin", count: adminCount, color: "text-blue-600 bg-blue-50 dark:bg-blue-900/20" },
          { label: "Employee", count: employeeCount, color: "text-green-600 bg-green-50 dark:bg-green-900/20" },
        ].map((s) => (
          <div key={s.label} className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm text-sm">
            <span className={cn("h-6 w-6 rounded-lg flex items-center justify-center text-xs font-bold shrink-0", s.color)}>
              {s.count}
            </span>
            <span className="text-slate-500 dark:text-slate-400">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Category filter */}
      <div className="flex gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl w-fit">
        {(["ALL", "ADMIN", "EMPLOYEE"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "px-4 py-1.5 text-sm font-medium rounded-lg transition-all",
              filter === f
                ? "bg-white dark:bg-slate-900 text-primary shadow-sm"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white"
            )}
          >
            {f === "ALL" ? "All" : f === "ADMIN" ? "Admin" : "Employee"}
          </button>
        ))}
      </div>

      {/* Template grid */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <Loader2 className="animate-spin text-primary" size={28} />
          <p className="text-sm text-slate-500">Loading templates…</p>
        </div>
      ) : visible.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-slate-900 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
          <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Mail size={24} className="text-primary opacity-50" />
          </div>
          <p className="font-medium text-slate-700 dark:text-slate-300">No templates found</p>
          <button
            onClick={() => api.post("/admin/settings/email-templates/seed").then(fetchTemplates)}
            className="mt-3 text-xs text-primary hover:underline font-medium"
          >
            Re-seed templates
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {visible.map((t) => (
            <TemplateCard
              key={t.key}
              template={t}
              onPreview={() => setPreviewing(t)}
              onEdit={() => setEditing(t)}
            />
          ))}
        </div>
      )}

      {/* Preview modal */}
      {previewing && (
        <PreviewModal template={previewing} onClose={() => setPreviewing(null)} />
      )}

      {/* Edit modal */}
      {editing && (
        <EditModal
          template={editing}
          onClose={() => setEditing(null)}
          onSaved={(updated) => {
            handleSaved(updated);
            // keep editing with updated content
          }}
        />
      )}
    </div>
  );
}
