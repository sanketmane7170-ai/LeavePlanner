"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { ArrowLeft, Send, CheckCircle2, User, Mail, Phone, MessageSquare } from "lucide-react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { WeaveSpinner } from "@/components/ui/weave-spinner";
import { ThemeToggle } from "@/components/shared/ThemeToggle";

const formSchema = z.object({
  name: z.string().min(2, "Name is required"),
  email: z.string().email("Please enter a valid email address"),
  mobile: z.string().optional(),
  reason: z.string().min(10, "Please provide more details (min 10 characters)"),
});

type FormValues = z.infer<typeof formSchema>;

export default function ContactAdminPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "", email: "", mobile: "", reason: "" },
  });

  const onSubmit = async (data: FormValues) => {
    setLoading(true);
    try {
      await api.post("/support", data);
      setSuccess(true);
      toast.success("Message sent successfully!");
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to send message");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950">
      <div className="absolute top-4 right-4"><ThemeToggle /></div>
      
      {/* Left side styling similar to login page */}
      <div className="hidden lg:flex w-1/2 bg-slate-900 flex-col justify-between p-12 relative overflow-hidden">
        <div className="absolute top-[-10%] right-[-5%] w-96 h-96 bg-primary/20 blur-[100px] rounded-full mix-blend-screen" />
        <div className="absolute bottom-[-10%] left-[-5%] w-96 h-96 bg-blue-500/20 blur-[100px] rounded-full mix-blend-screen" />
        
        <div className="relative z-10 flex items-center gap-3">
          <div className="h-10 w-10 bg-gradient-to-br from-primary to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-primary/20">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-white">
              <rect width="18" height="18" x="3" y="3" rx="4" />
              <path d="M8 12h8" />
              <path d="M12 8v8" />
            </svg>
          </div>
          <span className="text-2xl font-bold font-heading text-white tracking-tight">Innovizia</span>
        </div>

        <div className="relative z-10 max-w-md">
          <MessageSquare className="text-primary/80 h-12 w-12 mb-6" />
          <h1 className="text-4xl font-bold text-white font-heading leading-tight mb-4">
            Get in touch
          </h1>
          <p className="text-slate-400 text-lg leading-relaxed">
            Having trouble accessing your account? Fill out the form and our administrative team will reach out to help you shortly.
          </p>
        </div>
        <div className="relative z-10 text-slate-500 text-sm">
          &copy; {new Date().getFullYear()} Innovizia Leave Planner
        </div>
      </div>

      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 sm:p-12 relative overflow-y-auto max-h-screen">
        <button
          onClick={() => router.push("/login")}
          className="absolute top-8 left-8 p-2 rounded-xl text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
        >
          <ArrowLeft size={20} />
        </button>

        <div className="w-full max-w-md space-y-8 my-auto">
          {success ? (
            <div className="flex flex-col items-center justify-center space-y-6 py-12 text-center">
              <div className="h-20 w-20 bg-green-100 dark:bg-green-900/30 text-green-600 rounded-full flex items-center justify-center mb-4">
                <CheckCircle2 size={40} />
              </div>
              <h2 className="text-2xl font-bold font-heading text-slate-900 dark:text-white">Message Sent!</h2>
              <p className="text-slate-500 dark:text-slate-400 max-w-sm">
                The administration team has received your message and will review it shortly. They will contact you via email or phone.
              </p>
              <Button onClick={() => router.push("/login")} className="w-full h-12 text-base mt-4">
                Return to Login
              </Button>
            </div>
          ) : (
            <>
              <div className="text-center pt-8">
                <h2 className="text-3xl font-bold font-heading text-slate-900 dark:text-white">
                  Contact Admin
                </h2>
                <p className="text-slate-500 dark:text-slate-400 mt-2">
                  Please provide your details below.
                </p>
              </div>

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 pb-8">
                <div className="space-y-1.5 relative">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300 ml-1">Full Name</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                      <User className="h-5 w-5 text-slate-400" />
                    </div>
                    <input
                      {...register("name")}
                      placeholder="John Doe"
                      className="w-full pl-11 pr-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                    />
                  </div>
                  {errors.name && <p className="text-red-500 text-xs mt-1 ml-1">{errors.name.message}</p>}
                </div>

                <div className="space-y-1.5 relative">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300 ml-1">Email Address</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                      <Mail className="h-5 w-5 text-slate-400" />
                    </div>
                    <input
                      {...register("email")}
                      type="email"
                      placeholder="name@innovizia.com"
                      className="w-full pl-11 pr-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                    />
                  </div>
                  {errors.email && <p className="text-red-500 text-xs mt-1 ml-1">{errors.email.message}</p>}
                </div>

                <div className="space-y-1.5 relative">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300 ml-1">Mobile Number (Optional)</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                      <Phone className="h-5 w-5 text-slate-400" />
                    </div>
                    <input
                      {...register("mobile")}
                      type="tel"
                      placeholder="+91 9876543210"
                      className="w-full pl-11 pr-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300 ml-1">Reason / Message</label>
                  <textarea
                    {...register("reason")}
                    placeholder="Describe your issue here..."
                    rows={4}
                    className="w-full p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all resize-none"
                  />
                  {errors.reason && <p className="text-red-500 text-xs mt-1 ml-1">{errors.reason.message}</p>}
                </div>

                <Button type="submit" className="w-full h-12 text-base shadow-lg shadow-primary/25 mt-2" disabled={loading}>
                  {loading ? <WeaveSpinner className="animate-spin mr-2" size={18} /> : <Send size={18} className="mr-2" />}
                  Submit Request
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
