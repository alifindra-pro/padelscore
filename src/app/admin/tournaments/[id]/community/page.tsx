"use client";
import { Suspense, use } from "react";
import Link from "next/link";
import { HeaderEditor } from "@/components/tournament/HeaderEditor";
import { Sponsors } from "@/components/tournament/Sponsors";
import { DisputeReview } from "@/components/tournament/DisputeReview";
function Content({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <div className="space-y-7">
      <Link className="section-link" href={`/admin/tournaments/${id}`}>
        ← Kelola turnamen
      </Link>
      <header>
        <p className="page-eyebrow">INFORMASI & LAYANAN PESERTA</p>
        <h1 className="page-heading">Header, sponsor & sanggahan</h1>
        <p className="page-intro">
          Atur tampilan turnamen, kelola sponsor, dan tanggapi peserta.
        </p>
      </header>
      <HeaderEditor tournamentId={id} />
      <Sponsors tournamentId={id} manage />
      <DisputeReview tournamentId={id} />
    </div>
  );
}
export default function Page(props: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p>Memuat…</p>}>
      <Content {...props} />
    </Suspense>
  );
}
