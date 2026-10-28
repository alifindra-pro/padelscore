import { Suspense } from "react";
import { connection } from "next/server";
import LoginForm from "./LoginForm";

async function LoginContent() {
  await connection();
  return (
    <LoginForm quickLogin={process.env.TEMPORARY_BUTTON_LOGIN === "true"} />
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
