import Link from "next/link";
import { Icon } from "./Icon";

export function AppBrand({ href = "/" }: { href?: string }) {
  return (
    <Link
      href={href}
      className="app-brand"
      aria-label="Padel Score for Padel Addictive, beranda"
    >
      <span className="app-brand-mark">
        <Icon name="court" size={23} />
      </span>
      <span className="app-brand-copy">
        <strong>
          PADEL<span> SCORE</span>
        </strong>
        <small>for PADEL ADDICTIVE</small>
      </span>
    </Link>
  );
}
