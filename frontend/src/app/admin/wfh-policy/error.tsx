"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

export default function WfhPolicyError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("WFH Policy page error:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <AlertTriangle size={40} className="text-amber-500 mb-4" />
      <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
        Something went wrong
      </h2>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 max-w-sm">
        {error.message || "Failed to load WFH policies. Please try again."}
      </p>
      <Button onClick={reset} size="sm">
        Try Again
      </Button>
    </div>
  );
}
