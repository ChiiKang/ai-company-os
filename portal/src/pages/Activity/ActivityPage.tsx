import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Lead, LeadStatus } from "@/types";
import { usePortal } from "@/store/PortalProvider";
import { Button, Card, EmptyState, Field, SearchInput, Select, useToast } from "@/components/ui";
import { clsx, formatDate, formatNumber, fullName } from "@/lib/format";
import { ArchiveLeadModal, EditLeadModal, LEAD_STATUSES, STATUS_META, StatusBadge, WorkflowMenu, useMediaQuery } from "./shared";
import "./activity.css";

type SortKey = "newest" | "oldest" | "name_asc" | "name_desc" | "status";
const PAGE_SIZE = 25;

const SORTS: { value: SortKey; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "name_asc", label: "Name A–Z" },
  { value: "name_desc", label: "Name Z–A" },
  { value: "status", label: "Status" },
];

function matches(l: Lead, q: string): boolean {
  if (!q) return true;
  const hay = [l.firstName, l.lastName, fullName(l), l.state, l.city, l.address, l.zip, l.phone, l.email, l.id].join(" ").toLowerCase();
  return q.split(/\s+/).every((part) => hay.includes(part));
}

function sortLeads(list: Lead[], sort: SortKey): Lead[] {
  const byTime = (a: Lead, b: Lead) => new Date(b.lastReachedAt).getTime() - new Date(a.lastReachedAt).getTime();
  const byName = (a: Lead, b: Lead) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName);
  const out = [...list];
  switch (sort) {
    case "newest":
      return out.sort(byTime);
    case "oldest":
      return out.sort((a, b) => byTime(b, a));
    case "name_asc":
      return out.sort(byName);
    case "name_desc":
      return out.sort((a, b) => byName(b, a));
    case "status":
      return out.sort((a, b) => LEAD_STATUSES.indexOf(a.status) - LEAD_STATUSES.indexOf(b.status) || byTime(a, b));
  }
}

export function ActivityPage() {
  const { leads } = usePortal();
  const navigate = useNavigate();
  const toast = useToast();
  const mobile = useMediaQuery("(max-width: 759px)");

  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const [status, setStatus] = useState<LeadStatus | "all">("all");
  const [page, setPage] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState<Lead | null>(null);
  const [archiving, setArchiving] = useState<Lead | null>(null);

  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => sortLeads(leads.filter((l) => (status === "all" || l.status === status) && matches(l, q)), sort), [leads, q, status, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const start = safePage * PAGE_SIZE;
  const rows = filtered.slice(start, start + PAGE_SIZE);
  useEffect(() => setPage(0), [q, status, sort]);

  const refresh = () => {
    if (refreshing) return;
    setRefreshing(true);
    window.setTimeout(() => {
      setRefreshing(false);
      toast("Activity refreshed", "success");
    }, 600);
  };

  const open = (l: Lead) => navigate(`/activity/${l.id}`);
  const searching = q.length > 0 || status !== "all";

  return (
    <div className="page act fade-up">
      <header className="act-head">
        <h1 className="h-display act-title">Activity</h1>
        <p className="muted act-sub">All leads captured across your workflows.</p>
      </header>

      <div className="act-toolbar" role="region" aria-label="Lead filters">
        <div className="act-toolbar-left">
          <span className="eyebrow act-count">All leads ({formatNumber(filtered.length)})</span>
          {searching ? (
            <span className="small faint act-results" aria-live="polite">
              {formatNumber(filtered.length)} {filtered.length === 1 ? "result" : "results"}
              {" · "}
              <button type="button" className="act-link" onClick={() => { setQuery(""); setStatus("all"); }}>
                Clear
              </button>
            </span>
          ) : null}
        </div>
        <div className="act-toolbar-right">
          <label className="sr-only" htmlFor="act-search">Search leads</label>
          <SearchInput id="act-search" className="act-search" placeholder="Search name, state, address…" value={query} onChange={(e) => setQuery(e.target.value)} />
          <Field label={<span className="sr-only">Sort</span>} htmlFor="act-sort" className="act-ctl act-ctl-sort">
            <Select id="act-sort" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort leads">
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </Select>
          </Field>
          <Field label={<span className="sr-only">Status</span>} htmlFor="act-status" className="act-ctl act-ctl-status">
            <Select id="act-status" value={status} onChange={(e) => setStatus(e.target.value as LeadStatus | "all")} aria-label="Filter by status">
              <option value="all">All statuses</option>
              {LEAD_STATUSES.map((s) => (
                <option key={s} value={s}>{STATUS_META[s].label}</option>
              ))}
            </Select>
          </Field>
          <Button variant="secondary" icon="refresh" onClick={refresh} aria-label="Refresh activity" className={clsx("act-refresh", refreshing && "is-spinning")}>
            <span className="act-refresh-label">Refresh</span>
          </Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card pad="lg" className="act-empty">
          <EmptyState
            icon="search"
            title="No leads match"
            action={
              <Button variant="secondary" size="sm" icon="x" onClick={() => { setQuery(""); setStatus("all"); }}>
                Clear search
              </Button>
            }
          >
            Try a different name, state, address or status.
          </EmptyState>
        </Card>
      ) : mobile ? (
        <ul className="act-cards" aria-label="Leads">
          {rows.map((l) => (
            <li key={l.id} className="act-card">
              <button type="button" className="act-card-name" onClick={() => open(l)}>
                <span className="act-card-title">{fullName(l)}</span>
                <StatusBadge status={l.status} />
              </button>
              <div className="small muted act-card-meta">
                <span className="mono">{l.state}</span> · {l.city} · Last reached {formatDate(l.lastReachedAt)}
              </div>
              <div className="act-card-actions">
                <Button variant="secondary" size="sm" icon="activity" onClick={() => open(l)}>
                  Activity feed
                </Button>
                <WorkflowMenu lead={l} />
                <span className="grow" />
                <Button variant="ghost" size="sm" icon="edit" aria-label={`Edit ${fullName(l)}`} onClick={() => setEditing(l)} />
                <Button variant="ghost" size="sm" icon="trash" aria-label={`Archive ${fullName(l)}`} onClick={() => setArchiving(l)} />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="table-wrap act-table-wrap">
          <table className="table act-table">
            <thead>
              <tr>
                <th scope="col">First name</th>
                <th scope="col">Last name</th>
                <th scope="col">State</th>
                <th scope="col">Last reached</th>
                <th scope="col">Recent activity</th>
                <th scope="col">Quick commands</th>
                <th scope="col" className="act-th-edit">Edit</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((l) => (
                <tr key={l.id}>
                  <td className="act-td-name">
                    <button type="button" className="act-namebtn" onClick={() => open(l)}>{l.firstName}</button>
                  </td>
                  <td className="act-td-name">
                    <span className="act-lastname">
                      <button type="button" className="act-namebtn" onClick={() => open(l)} aria-label={`Open ${fullName(l)}`}>{l.lastName}</button>
                      <StatusBadge status={l.status} />
                    </span>
                  </td>
                  <td>
                    <span className="mono act-state" title={l.city}>{l.state}</span>
                  </td>
                  <td className="act-td-date">{formatDate(l.lastReachedAt)}</td>
                  <td>
                    <Button variant="secondary" size="sm" icon="activity" onClick={() => open(l)}>
                      Activity feed
                    </Button>
                  </td>
                  <td>
                    <WorkflowMenu lead={l} />
                  </td>
                  <td className="act-td-edit">
                    <span className="act-edit-btns">
                      <Button variant="ghost" size="sm" icon="edit" aria-label={`Edit ${fullName(l)}`} title="Edit lead" onClick={() => setEditing(l)} />
                      <Button variant="ghost" size="sm" icon="trash" aria-label={`Archive ${fullName(l)}`} title="Archive lead" onClick={() => setArchiving(l)} />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {filtered.length > 0 ? (
        <nav className="act-pager" aria-label="Pagination">
          <span className="small faint act-pager-hint">{PAGE_SIZE} per page</span>
          <div className="act-pager-ctl">
            <Button variant="ghost" size="sm" icon="chevron-left" aria-label="Previous page" disabled={safePage === 0} onClick={() => setPage((p) => Math.max(0, p - 1))} />
            <span className="mono small act-pager-label" aria-live="polite">
              {formatNumber(start + 1)}–{formatNumber(Math.min(start + PAGE_SIZE, filtered.length))} of {formatNumber(filtered.length)}
            </span>
            <Button variant="ghost" size="sm" icon="chevron-right" aria-label="Next page" disabled={safePage >= pageCount - 1} onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} />
          </div>
        </nav>
      ) : null}

      <EditLeadModal lead={editing} onClose={() => setEditing(null)} />
      <ArchiveLeadModal lead={archiving} onClose={() => setArchiving(null)} />
    </div>
  );
}
