import { redirect } from "next/navigation";

/**
 * Root /admin page redirects cleanly to /admin/dashboard.
 * This prevents 404s and ensures all admin entries lead to the canonical dashboard.
 */
export default function AdminPage() {
  redirect("/admin/dashboard");
}
