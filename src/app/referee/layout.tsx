import type { ReactNode } from "react";
import { PublicShell } from "@/components/ui/PublicShell";

export default function Layout({ children }: { children: ReactNode }) {
  return <PublicShell referee>{children}</PublicShell>;
}
