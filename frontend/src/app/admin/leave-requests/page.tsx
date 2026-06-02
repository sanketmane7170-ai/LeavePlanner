import { redirect } from "next/navigation";

export default function LeaveRequestsRedirect() {
  redirect("/admin/leave-requests/leave");
}
