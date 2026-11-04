import { Suspense } from "react";
import { connection } from "next/server";
import LoginForm from "./LoginForm";
import { isTemporaryLoginEnabled } from "@/lib/temporary-login";

async function LoginContent() {
  await connection();
  return (
    <LoginForm quickLogin={isTemporaryLoginEnabled()} />
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen grid place-items-center">
          Memuat halaman masuk…
        </main>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
