import { useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import type { IconName } from "@/types";
import { Icon } from "@/components/ui";
import { useTheme } from "@/theme/ThemeProvider";
import { usePortal, usePortalActions } from "@/store/PortalProvider";
import { Logo, Wordmark } from "./Logo";

export interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  kbd?: string;
  end?: boolean;
}

export const NAV: NavItem[] = [
  { to: "/", label: "Agent Command Center", icon: "command", kbd: "⌘", end: true },
  { to: "/activity", label: "Activity", icon: "activity" },
  { to: "/wallet", label: "Wallet", icon: "wallet" },
  { to: "/settings", label: "Settings", icon: "settings" },
  { to: "/support", label: "Support", icon: "support" },
];

function isActive(pathname: string, item: NavItem): boolean {
  if (item.end) return pathname === "/" || pathname.startsWith("/command-center");
  return pathname === item.to || pathname.startsWith(item.to + "/");
}

export function Rail() {
  const { theme, toggle } = useTheme();
  const { user } = usePortal();
  const { pathname } = useLocation();
  const [menu, setMenu] = useState(false);

  useEffect(() => setMenu(false), [pathname]);

  return (
    <>
      <aside className="rail" aria-label="Primary">
        <button type="button" className="rail-logo" aria-label="Open menu" onClick={() => setMenu(true)}>
          <Logo size={26} />
        </button>
        <nav className="rail-nav">
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} className="rail-item" aria-current={isActive(pathname, item) ? "page" : undefined} aria-label={item.label}>
              <Icon name={item.icon} size={18} />
              <span className="rail-tip">{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="rail-spacer" />
        <div className="rail-bottom">
          <button type="button" className="rail-item" onClick={toggle} aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}>
            <Icon name={theme === "dark" ? "moon" : "sun"} size={18} />
            <span className="rail-tip">{theme === "dark" ? "Dark mode on" : "Light mode on"}</span>
          </button>
          <button type="button" className="rail-item" onClick={() => setMenu(true)} aria-label={`Account: ${user.email}`}>
            <span className="avatar avatar-sm">{user.initials}</span>
            <span className="rail-tip">{user.email}</span>
          </button>
        </div>
      </aside>
      <div className="topbar">
        <button type="button" className="btn btn-ghost btn-icon" aria-label="Open menu" onClick={() => setMenu(true)}>
          <Icon name="menu" size={18} />
        </button>
        <Wordmark />
      </div>
      {menu ? <Menu onClose={() => setMenu(false)} /> : null}
    </>
  );
}

function Menu({ onClose }: { onClose: () => void }) {
  const { theme, toggle } = useTheme();
  const { user } = usePortal();
  const { signOut } = usePortalActions();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <div className="menu-backdrop" onMouseDown={onClose} />
      <div className="menu" role="dialog" aria-label="Navigation menu">
        <div className="menu-brand">
          <Wordmark />
        </div>
        {NAV.slice(0, 3).map((item) => (
          <button key={item.to} type="button" className="menu-item" aria-current={isActive(pathname, item) ? "page" : undefined} onClick={() => { navigate(item.to); onClose(); }}>
            <span className="kbd-slot">{item.kbd ? <span className="kbd">{item.kbd}</span> : null}</span>
            <Icon name={item.icon} size={18} className="menu-icon" />
            {item.label}
          </button>
        ))}
        <div className="menu-sep" />
        {NAV.slice(3).map((item) => (
          <button key={item.to} type="button" className="menu-item" aria-current={isActive(pathname, item) ? "page" : undefined} onClick={() => { navigate(item.to); onClose(); }}>
            <span className="kbd-slot" />
            <Icon name={item.icon} size={18} className="menu-icon" />
            {item.label}
          </button>
        ))}
        <button type="button" className="menu-item" onClick={toggle}>
          <span className="kbd-slot" />
          <Icon name={theme === "dark" ? "moon" : "sun"} size={18} className="menu-icon" />
          {theme === "dark" ? "Dark mode" : "Light mode"}
          <span className="menu-end">
            <span className="toggle" role="switch" aria-checked={theme === "dark"} aria-label="Dark mode" />
          </span>
        </button>
        <div className="menu-sep" />
        <div className="menu-profile">
          <span className="avatar">{user.initials}</span>
          <span className="email" title={user.email}>{user.email}</span>
          <button type="button" className="signout" onClick={signOut}>
            Sign Out <Icon name="logout" size={15} />
          </button>
        </div>
      </div>
    </>
  );
}
