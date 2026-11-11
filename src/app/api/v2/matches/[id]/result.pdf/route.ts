import { NextRequest } from "next/server";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { readFile } from "node:fs/promises";
import path from "node:path";
import prisma from "@/lib/db";
import { getAuthUser } from "@/middleware/auth.middleware";
import { matchAccess, PUBLIC_STATUSES } from "@/lib/v2/access";
import { AppError, handleApiError } from "@/lib/errors";
import {
  directPointsSummary,
  setPointScores,
  type ScoreState,
} from "../../../../../../../packages/core/src";
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await getAuthUser(req);
    const m = await prisma.match.findUnique({
      where: { id },
      include: {
        entryA: true,
        entryB: true,
        winner: true,
        court: true,
        scoreSnapshot: true,
        officials: { include: { user: { select: { fullName: true } } } },
        stage: { include: { category: { include: { tournament: true } } } },
      },
    });
    if (!m) throw AppError.notFound("Pertandingan tidak ditemukan");
    const t = m.stage.category.tournament;
    if (!PUBLIC_STATUSES.includes(t.status)) {
      if (!user) throw AppError.notFound();
      await matchAccess(user, id);
    }
    if (m.approvalStatus !== "APPROVED" && m.status !== "APPROVED")
      throw AppError.conflict(
        "PDF hasil akhir tersedia setelah admin mengesahkan hasil.",
      );
    if (!m.entryA || !m.entryB)
      throw AppError.conflict(
        "Pertandingan bye tidak memiliki laporan hasil laga.",
      );
    const audits = await prisma.auditLog.findMany({
      where: {
        entityId: id,
        entityType: "Match",
        action: { in: ["APPROVE_V2", "APPROVE_MATCH_RESULT"] },
      },
      orderBy: { createdAt: "desc" },
      take: 1,
    });
    const pdf = await PDFDocument.create();
    pdf.registerFontkit(fontkit);
    const font = await pdf.embedFont(
      await readFile(
        path.join(process.cwd(), "public/fonts/plus-jakarta-sans.ttf"),
      ),
      { subset: true },
    );
    pdf.setTitle(`Hasil pertandingan ${m.matchNumber} - ${t.name}`);
    pdf.setAuthor("Padel Score by Padel Addictive");
    let page = pdf.addPage([595.28, 841.89]);
    let y = 790;
    const navy = rgb(0.09, 0.18, 0.25),
      blue = rgb(0, 0.37, 0.67);
    let pages = 1;
    function line(text: string, size = 11) {
      const words = text.replace(/[\r\n]+/g, " ").split(" ");
      let current = "";
      for (const word of words) {
        for (const char of (current ? " " : "") + word) {
          if (font.widthOfTextAtSize(current + char, size) > 495) {
            write(current, size);
            current = "";
          }
          current += char;
        }
      }
      if (current) write(current, size);
    }
    function write(text: string, size: number) {
      if (y < 65) {
        page = pdf.addPage([595.28, 841.89]);
        pages++;
        y = 790;
      }
      page.drawText(text, {
        x: 50,
        y,
        size,
        font,
        color: size > 16 ? blue : navy,
      });
      y -= size + 10;
    }
    const date = (value: Date | null) =>
      value
        ? new Intl.DateTimeFormat("id-ID", {
            timeZone: t.timezone,
            dateStyle: "long",
            timeStyle: "medium",
          }).format(value)
        : "Tidak tercatat";
    line("PADEL SCORE by PADEL ADDICTIVE", 12);
    line("HASIL AKHIR PERTANDINGAN", 22);
    line(t.name, 16);
    line(`${m.stage.category.name} | ${m.stage.name}`);
    line(
      `Laga ${m.matchNumber} | Babak ${m.round} | ${m.court?.name ?? "Lapangan belum dicatat"}`,
    );
    y -= 12;
    line(`Pasangan A: ${m.entryA.name}`, 13);
    line(`Pasangan B: ${m.entryB.name}`, 13);
    line(`Pemenang: ${m.winner?.name ?? "Seri"}`, 15);
    y -= 10;
    const state = m.stateV2 as unknown as ScoreState | null;
    if (state?.rules.mode === "POINTS") {
      const scores = setPointScores(state);
      if (scores.length) {
        line(
          `Kemenangan set: ${state.sets.filter((s) => s.winner === "A").length} : ${state.sets.filter((s) => s.winner === "B").length}`,
          16,
        );
        scores.forEach((score, i) =>
          line(`Set ${i + 1}: ${score[0]} : ${score[1]}`, 13),
        );
      } else line(`Poin langsung: ${state.points[0]} : ${state.points[1]}`, 16);
      line(directPointsSummary(state.rules));
    } else if (state)
      state.sets.forEach((set, i) =>
        line(
          set.kind === "MATCH_TIEBREAK"
            ? `Set ${i + 1} (match tie-break): ${set.tiebreak[0]} : ${set.tiebreak[1]}`
            : `Set ${i + 1}: ${set.games[0]} : ${set.games[1]}${set.tiebreak.some(Boolean) ? ` | Tie-break ${set.tiebreak[0]} : ${set.tiebreak[1]}` : ""}`,
          13,
        ),
      );
    else
      m.scoreSnapshot?.gamesA.forEach((a, i) =>
        line(`Set ${i + 1}: ${a} : ${m.scoreSnapshot?.gamesB[i] ?? 0}`, 13),
      );
    if (state)
      line(
        `Aturan: ${state.rules.name}${state.rules.mode === "POINTS" ? "" : ` (${state.rules.deuce})`}`,
      );
    line(`Status hasil: ${state?.status ?? m.status}`);
    y -= 10;
    line(`Jadwal: ${date(m.scheduledAt)}`);
    line(`Mulai tercatat: ${date(m.startedAt)}`);
    line(`Hasil selesai diterima server: ${date(m.finishedAt)}`);
    line(`Pengesahan admin: ${date(audits[0]?.createdAt ?? null)}`);
    line(`Zona waktu: ${t.timezone}`);
    line(
      `Wasit yang ditugaskan: ${m.officials.map((o) => o.user.fullName).join(", ") || "Belum tercatat"}`,
    );
    y -= 10;
    line(
      "Waktu tercatat menggunakan waktu server. Aksi offline dapat diterima setelah pertandingan selesai.",
      10,
    );
    line(`ID pertandingan: ${m.id}`, 9);
    line(`Versi skor: ${m.version} | Dicetak: ${date(new Date())}`, 9);
    pdf.getPages().forEach((p, i) =>
      p.drawText(
        `Padel Score by Padel Addictive | Hasil disahkan | ${i + 1}/${pages}`,
        {
          x: 50,
          y: 30,
          font,
          size: 9,
          color: navy,
        },
      ),
    );
    return new Response(Buffer.from(await pdf.save()), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="hasil-laga-${m.matchNumber}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return handleApiError(e);
  }
}
