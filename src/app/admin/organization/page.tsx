"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { useAuth } from "@/context/AuthContext";
import {
  StaffAccounts,
  type StaffMember,
} from "@/components/admin/StaffAccounts";
interface Organization {
  id: string;
  name: string;
  members: StaffMember[];
}
interface Venue {
  id: string;
  name: string;
  address: string;
  courts: { id: string; name: string }[];
}
export default function Organizations() {
  const { user } = useAuth();
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [selected, setSelected] = useState("");
  const [venues, setVenues] = useState<Venue[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const load = () =>
    apiFetch<Organization[]>("/api/v2/organizations").then((data) => {
      setOrgs(data);
      setSelected((current) => {
        const saved = current || localStorage.getItem("padel-organization");
        return data.some((org) => org.id === saved)
          ? saved!
          : data[0]?.id || "";
      });
    });
  useEffect(() => {
    load().catch((e) => setMessage(e.message));
  }, []);
  useEffect(() => {
    if (selected) {
      localStorage.setItem("padel-organization", selected);
      apiFetch<Venue[]>(`/api/v2/venues?organizationId=${selected}`)
        .then(setVenues)
        .catch((e) => setMessage(e.message));
    }
  }, [selected]);
  const org = orgs.find((o) => o.id === selected);
  return (
    <div className="space-y-6">
      <div className="app-page-heading">
        <p className="page-eyebrow">TIM YANG HEBAT. PERMAINAN YANG HEBAT.</p>
        <h1 className="page-heading">Akun & organisasi</h1>
        <p className="page-intro">
          Kelola akun tim, organisasi, venue, dan lapangan.
        </p>
      </div>
      <label className="field max-w-lg">
        Organisasi aktif
        <select value={selected} onChange={(e) => setSelected(e.target.value)}>
          {orgs.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </label>
      <p role="status">{message}</p>
      {user?.role === "SUPER_ADMIN" && (
        <form
          className="panel flex flex-wrap gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            setBusy(true);
            try {
              const org = await apiFetch<Organization>(
                "/api/v2/organizations",
                {
                  method: "POST",
                  body: JSON.stringify({ name: form.get("name") }),
                },
              );
              await load();
              setSelected(org.id);
            } catch (e) {
              setMessage((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="field flex-1">
            Organisasi baru
            <input name="name" required minLength={2} />
          </label>
          <button className="btn-primary" disabled={busy}>
            Buat organisasi
          </button>
        </form>
      )}
      <StaffAccounts
        key={selected}
        organizationId={selected}
        members={org?.members || []}
        canManage={
          user?.role === "SUPER_ADMIN" ||
          !!org?.members.some(
            (member) =>
              member.user.id === user?.id &&
              ["OWNER", "ADMIN"].includes(member.role),
          )
        }
        onCreated={load}
      />
      <section className="panel space-y-4">
        <h2 className="text-xl font-bold">Venue & lapangan bersama</h2>
        {venues.map((v) => (
          <div key={v.id}>
            <strong>{v.name}</strong>
            <p>{v.address}</p>
            <p className="text-secondary">
              {v.courts.map((c) => c.name).join(" · ")}
            </p>
          </div>
        ))}
        <form
          className="grid md:grid-cols-2 gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            setBusy(true);
            try {
              await apiFetch("/api/v2/venues", {
                method: "POST",
                body: JSON.stringify({
                  organizationId: selected,
                  name: f.get("name"),
                  address: f.get("address"),
                  courts: String(f.get("courts"))
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                  timezone: f.get("timezone"),
                }),
              });
              setVenues(
                await apiFetch(`/api/v2/venues?organizationId=${selected}`),
              );
              setMessage("Venue ditambahkan");
            } catch (e) {
              setMessage((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="field">
            Nama venue
            <input name="name" required />
          </label>
          <label className="field">
            Alamat
            <input name="address" />
          </label>
          <label className="field">
            Nama lapangan, pisahkan koma
            <input
              name="courts"
              placeholder="Lapangan 1, Lapangan 2"
              required
            />
          </label>
          <label className="field">
            Zona waktu
            <select name="timezone">
              <option>Asia/Jakarta</option>
              <option>Asia/Makassar</option>
              <option>Asia/Jayapura</option>
            </select>
          </label>
          <button className="btn-primary" disabled={!selected || busy}>
            Tambah venue
          </button>
        </form>
      </section>
    </div>
  );
}
