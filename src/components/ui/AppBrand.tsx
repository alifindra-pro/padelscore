import Link from "next/link";
import { Icon } from "./Icon";

export function AppBrand({ href = "/" }: { href?: string }) {
  return (
    <Link
      href={href}
      className="app-brand"
      aria-label="Padel Indonesia, beranda"
    >
      <span className="app-brand-mark">
        <Icon name="court" size={23} />
      </span>
      <span>
        PADEL<span> INDONESIA</span>
      </span>
    </Link>
  );
}
