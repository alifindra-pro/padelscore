import Dashboard from "./Dashboard";

// The admin shell waits for client-side session and organization checks.
// This route cannot promise an instant UI until those checks finish.
export const instant = false;

export default function AdminPage() {
  return <Dashboard />;
}
