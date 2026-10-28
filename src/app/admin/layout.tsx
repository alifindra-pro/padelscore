"use client";
import { useEffect, useState, useRef, Suspense } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api-client";
import { AppBrand } from "@/components/ui/AppBrand";
import { Icon } from "@/components/ui/Icon";
const navigation = [
  { label: "Ringkasan", href: "/admin", icon: "grid" },
  { label: "Turnamen", href: "/admin/tournaments", icon: "trophy" },
  { label: "Americano / Mexicano", href: "/admin/social", icon: "court" },
  { label: "Pemain", href: "/admin/players", icon: "users" },
];
function Shell({ children }: { children: React.ReactNode }) {
  const { user, isLoading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [menuPath, setMenu] = useState<string | null>(null);
  const menu = menuPath === pathname;
  const sidebar = useRef<HTMLElement>(null);
  const [organizations, setOrganizations] = useState<
    { id: string; name: string }[]
  >([]);
  const [organization, setOrganization] = useState("");
  const [organizationsReady, setOrganizationsReady] = useState(false);
  const [organizationError, setOrganizationError] = useState("");
  useEffect(() => {
    if (!isLoading && !user) router.replace("/login");
  }, [user, isLoading, router]);
  useEffect(() => {
    if (user && ["ORGANIZER", "SUPER_ADMIN"].includes(user.role)) {
      apiFetch<{ id: string; name: string }[]>("/api/v2/organizations")
        .then((orgs) => {
          setOrganizations(orgs);
          const saved = localStorage.getItem("padel-organization");
          const id = orgs.find((o) => o.id === saved)?.id ?? orgs[0]?.id ?? "";
          setOrganization(id);
          if (id) localStorage.setItem("padel-organization", id);
        })
        .catch((e) => setOrganizationError(e.message))
        .finally(() => setOrganizationsReady(true));
    }
  }, [user]);
  useEffect(() => {
    if (!menu) return;
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenu(null);
        document.getElementById("admin-menu-toggle")?.focus();
      }
      if (e.key === "Tab") {
        const controls = sidebar.current?.querySelectorAll<HTMLElement>(
          "a[href], button:not(:disabled), select",
        );
        if (!controls?.length) return;
        const first = controls[0],
          last = controls[controls.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    sidebar.current?.querySelector<HTMLElement>("a")?.focus();
    document.addEventListener("keydown", close);
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
      document.removeEventListener("keydown", close);
    };
  }, [menu]);
  if (isLoading)
    return (
      <div className="min-h-screen grid place-items-center">
        <p>Memuat ruang pengelola…</p>
      </div>
    );
  if (!user) return null;
  if (!["SUPER_ADMIN", "ORGANIZER"].includes(user.role))
    return (
      <main className="page-shell py-16">
        <h1 className="text-2xl font-bold">Halaman khusus pengelola</h1>
        <Link
          href={user.role === "REFEREE" ? "/referee" : "/"}
          className="btn-primary mt-6"
        >
          {user.role === "REFEREE"
            ? "Buka penugasan wasit"
            : "Kembali ke acara"}
        </Link>
      </main>
    );
  return (
    <div className="admin-shell">
      <a href="#admin-main" className="app-skip-link">
        Lewati ke konten
      </a>
      <header className="mobile-header">
        <AppBrand href="/admin" />
        <button
          className="icon-button"
          onClick={() => setMenu(pathname)}
          id="admin-menu-toggle"
          aria-controls="admin-sidebar"
          aria-label="Buka navigasi"
          aria-expanded={menu}
        >
          <Icon name="menu" />
        </button>
      </header>
      {menu && (
        <button
          className="nav-scrim"
          aria-label="Tutup navigasi"
          onClick={() => setMenu(null)}
        />
      )}
      <aside
        ref={sidebar}
        id="admin-sidebar"
        className={`admin-sidebar ${menu ? "is-open" : ""}`}
        onClick={(event) => {
          if ((event.target as HTMLElement).closest("a")) setMenu(null);
        }}
      >
        <div className="flex justify-between items-center">
          <AppBrand href="/admin" />
          <button
            className="icon-button lg:hidden"
            aria-label="Tutup navigasi"
            onClick={() => setMenu(null)}
          >
            <Icon name="close" />
          </button>
        </div>
        <div className="workspace-label">
          <span className="workspace-beacon" /> RUANG PENGELOLA
        </div>
        {organizations.length > 0 && (
          <label className="org-switch">
            <span>Organisasi</span>
            <select
              aria-label="Organisasi aktif"
              value={organization}
              onChange={(e) => {
                localStorage.setItem("padel-organization", e.target.value);
                setOrganization(e.target.value);
                window.location.reload();
              }}
            >
              {organizations.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <nav aria-label="Navigasi pengelola" className="space-y-1">
          {navigation.map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== "/admin" && pathname.startsWith(item.href)) ||
              (item.href === "/admin/tournaments" &&
                pathname.startsWith("/admin/competition"));
            return (
              <Link
                key={item.href}
                className={`nav-item ${active ? "active" : ""}`}
                href={item.href}
                aria-current={active ? "page" : undefined}
              >
                <Icon name={item.icon} />
                {item.label}
                {active && <span className="nav-active-dot" />}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto pt-8">
          <p className="workspace-label mb-3">PENGATURAN</p>
          <Link
            href="/admin/organization"
            className={`nav-item ${pathname === "/admin/organization" ? "active" : ""}`}
          >
            <Icon name="settings" />
            Organisasi & venue
          </Link>
          <Link href="/" className="nav-item">
            <Icon name="arrow" />
            Lihat portal publik
          </Link>
          <div className="sidebar-profile">
            <Link
              href="/admin/profile"
              className="flex items-center gap-3 min-w-0"
            >
              <span className="profile-initial">
                {user.fullName.slice(0, 1)}
              </span>
              <span className="min-w-0">
                <strong className="block truncate">{user.fullName}</strong>
                <span className="text-xs text-secondary">Profil admin</span>
              </span>
            </Link>
            <button
              onClick={logout}
              className="icon-button"
              aria-label="Keluar akun"
            >
              <Icon name="logout" size={18} />
            </button>
          </div>
        </div>
      </aside>
      <div className="admin-body">
        <div className="desktop-topbar">
          <span>
            Ruang kerja{" "}
            <span className="text-ink">
              /{" "}
              {pathname.includes("social")
                ? "Pertandingan sosial"
                : pathname.includes("players")
                  ? "Pemain"
                  : pathname.includes("tournaments") ||
                      pathname.includes("competition")
                    ? "Turnamen"
                    : pathname.includes("organization")
                      ? "Organisasi & venue"
                      : pathname.includes("profile")
                        ? "Profil saya"
                        : "Ringkasan"}
            </span>
          </span>
          <Link href="/" className="flex gap-2 items-center">
            Portal publik <Icon name="arrow" size={16} />
          </Link>
        </div>
        <main id="admin-main" className="admin-content" tabIndex={-1}>
          {organizationError ? (
            <div className="panel empty-state" role="alert">
              <Icon name="court" size={32} />
              <h1 className="panel-title">Ruang kerja belum dapat dimuat</h1>
              <p>{organizationError}</p>
              <button
                className="btn-secondary"
                onClick={() => window.location.reload()}
              >
                Coba lagi
              </button>
            </div>
          ) : organizationsReady ? (
            children
          ) : (
            <p>Memuat organisasi…</p>
          )}
        </main>
      </div>
    </div>
  );
}
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<p className="p-8">Memuat…</p>}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}
