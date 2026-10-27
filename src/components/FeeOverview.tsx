import React, { useEffect, useMemo, useState } from 'react';
import { PiggyBank, Wallet, TrendingUp, ReceiptText, ExternalLink } from 'lucide-react';
import {
  FeeVoucher, Student, DateFilterState, FeeStatus, monthInFilter, formatPKR,
} from '../types';
import { Card, CardHeader, Badge, EmptyState, Table, Tabs, Avatar, SearchInput, Select } from './ui';
import { monthLabel } from './DateFilter';
import { DonutChart } from './DonutChart';

const statusTone: Record<FeeStatus, 'green' | 'amber' | 'red' | 'violet'> = {
  Paid: 'green',
  Partial: 'amber',
  Pending: 'red',
  Defaulter: 'violet',
};

const statusTabs: ('All' | FeeStatus)[] = ['All', 'Paid', 'Partial', 'Pending', 'Defaulter'];

const toneIcon: Record<string, string> = {
  emerald: 'bg-emerald-50 text-emerald-600',
  rose: 'bg-rose-50 text-rose-600',
  amber: 'bg-amber-50 text-amber-600',
  indigo: 'bg-indigo-50 text-indigo-600',
};

const MetricCard: React.FC<{
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  tone: 'emerald' | 'rose' | 'amber' | 'indigo';
  children?: React.ReactNode;
}> = ({ label, value, sub, icon, tone, children }) => (
  <Card className="p-4">
    <div className="flex items-center gap-3">
      <div className={`p-2.5 rounded-xl ${toneIcon[tone]}`}>{icon}</div>
      <div className="min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          {label}
        </div>
        <div className="text-xl font-extrabold text-slate-900 truncate">{value}</div>
        {sub && <div className="text-[11px] text-slate-500">{sub}</div>}
      </div>
    </div>
    {children}
  </Card>
);

export const FeeOverview: React.FC<{
  fees: FeeVoucher[];
  students: Student[];
  filter: DateFilterState;
  filterLabel: string;
  onOpenFees?: () => void;
}> = ({ fees, students, filter, filterLabel, onOpenFees }) => {
  const [tab, setTab] = useState<'All' | FeeStatus>('All');
  /** Donut slice selected for drill-down; null = chart only. */
  const [slice, setSlice] = useState<'collected' | 'pending' | null>(null);
  /** Class-wise filter + search, like the attendance roster. */
  const [cls, setCls] = useState('All');
  const [q, setQ] = useState('');

  const studentMap = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);

  // Class options are period-scoped, so reset the class filter when the period changes.
  useEffect(() => { setCls('All'); }, [filter]);

  /** Vouchers in the selected period, before class/search filters. */
  const periodFees = useMemo(
    () => fees.filter((f) => monthInFilter(f.month, filter)),
    [fees, filter]
  );

  const classOptions = useMemo(() => {
    const set = new Set<string>();
    for (const f of periodFees) {
      const s = studentMap.get(f.studentId);
      if (s) set.add(`${s.class}-${s.section}`);
    }
    return [...set].sort();
  }, [periodFees, studentMap]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return periodFees.filter((f) => {
      if (cls !== 'All') {
        const s = studentMap.get(f.studentId);
        if (!s || `${s.class}-${s.section}` !== cls) return false;
      }
      if (needle) {
        const s = studentMap.get(f.studentId);
        const hay = `${f.voucherNumber} ${s?.name || ''} ${s?.rollNumber || ''}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [periodFees, cls, q, studentMap]);

  const totals = useMemo(() => {
    const billed = filtered.reduce((a, f) => a + f.totalAmount, 0);
    const collected = filtered.reduce((a, f) => a + f.paidAmount, 0);
    const pending = filtered.reduce((a, f) => a + f.dueAmount, 0);
    return {
      billed,
      collected,
      pending,
      rate: billed > 0 ? (collected / billed) * 100 : 0,
      count: filtered.length,
    };
  }, [filtered]);

  const tabCounts = useMemo(() => {
    const counts = new Map<'All' | FeeStatus, number>();
    counts.set('All', filtered.length);
    for (const s of statusTabs.slice(1) as FeeStatus[]) {
      counts.set(s, filtered.filter((f) => f.status === s).length);
    }
    return counts;
  }, [filtered]);

  const rows = useMemo(
    () => filtered.filter((f) => tab === 'All' || f.status === tab),
    [filtered, tab]
  );

  /** Vouchers behind the selected donut slice (click a slice to drill down). */
  const sliceRows = useMemo(() => {
    if (!slice) return [];
    return filtered.filter((f) =>
      slice === 'collected' ? (f.paidAmount || 0) > 0 : (f.dueAmount || 0) > 0
    );
  }, [filtered, slice]);

  return (
    <Card>
      <CardHeader
        title="Fee Overview"
        subtitle="Billed vs collected vs pending for the selected period"
        pill={filterLabel}
        action={
          onOpenFees ? (
            <button
              type="button"
              onClick={onOpenFees}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              Open Fee Center
            </button>
          ) : undefined
        }
      />

      <div className="px-5 py-4">
        {/* Class + search filters first (like the attendance roster) — they drive the cards, chart and table below */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
          <SearchInput value={q} onChange={setQ} placeholder="Search voucher, student, roll…" />
          <Select value={cls} onChange={(e) => setCls(e.target.value)}>
            <option value="All">Class: All</option>
            {classOptions.map((c) => (
              <option key={c} value={c}>
                Class: {c}
              </option>
            ))}
          </Select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
          <MetricCard
            label="Collected"
            value={formatPKR(totals.collected)}
            sub={`of ${formatPKR(totals.billed)} billed`}
            icon={<PiggyBank className="w-5 h-5" />}
            tone="emerald"
          />
          <MetricCard
            label="Pending"
            value={formatPKR(totals.pending)}
            sub="outstanding dues"
            icon={<Wallet className="w-5 h-5" />}
            tone="rose"
          />
          <MetricCard
            label="Collection Rate"
            value={`${totals.rate.toFixed(1)}%`}
            sub="collected / billed"
            icon={<TrendingUp className="w-5 h-5" />}
            tone="amber"
          >
            <div className="mt-3 h-2 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-amber-500 transition-all"
                style={{ width: `${Math.min(100, totals.rate)}%` }}
              />
            </div>
          </MetricCard>
          <MetricCard
            label="Vouchers"
            value={String(totals.count)}
            sub="issued in period"
            icon={<ReceiptText className="w-5 h-5" />}
            tone="indigo"
          />
        </div>

        {/* Donut chart: collected vs pending, click a slice to see its vouchers */}
        <div className="rounded-2xl border border-slate-200 px-5 py-4 mb-5">
          <DonutChart
            segments={[
              { key: 'collected', label: 'Collected', value: totals.collected, color: '#10b981' },
              { key: 'pending', label: 'Pending', value: totals.pending, color: '#f43f5e' },
            ]}
            centerLabel="billed"
            centerValue={formatPKR(totals.billed)}
            selectedKey={slice}
            onSelect={(k) => setSlice(k as 'collected' | 'pending' | null)}
            formatValue={formatPKR}
          />
          {slice && (
            <div className="mt-4 border-t border-slate-100 pt-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-bold text-slate-800">
                  {slice === 'collected' ? 'Collected' : 'Pending'} — {sliceRows.length} voucher(s)
                  {' · '}
                  {formatPKR(slice === 'collected' ? totals.collected : totals.pending)}
                </div>
                <button
                  type="button"
                  onClick={() => setSlice(null)}
                  className="text-xs font-bold text-slate-500 hover:text-slate-800 px-2 py-1 rounded-lg hover:bg-slate-100"
                >
                  Close ✕
                </button>
              </div>
              {sliceRows.length === 0 ? (
                <EmptyState title="No vouchers" hint="Nothing in this slice for the selected period." />
              ) : (
                <div className="max-h-72 overflow-y-auto nice-scroll">
                  <Table head={['Voucher #', 'Student', 'Month', 'Paid', 'Due']}>
                    {sliceRows.map((f) => {
                      const s = studentMap.get(f.studentId);
                      return (
                        <tr key={f.id} className="hover:bg-slate-50">
                          <td className="px-3 py-2 font-semibold text-slate-800 whitespace-nowrap">{f.voucherNumber}</td>
                          <td className="px-3 py-2">
                            <div className="font-semibold text-slate-800">{s?.name || 'Unknown'}</div>
                            <div className="text-[11px] text-slate-400">{s?.rollNumber || ''}</div>
                          </td>
                          <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{monthLabel(f.month)}</td>
                          <td className="px-3 py-2 text-emerald-700 font-semibold whitespace-nowrap">{formatPKR(f.paidAmount)}</td>
                          <td className="px-3 py-2 text-rose-700 font-semibold whitespace-nowrap">{formatPKR(f.dueAmount)}</td>
                        </tr>
                      );
                    })}
                  </Table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Tabs + full table show only when no chart slice is open —
            otherwise the same vouchers would appear twice (drill-down + table). */}
        {!slice && (
          <>
            <Tabs
              tabs={statusTabs.map((s) => ({
                id: s,
                label: `${s} (${tabCounts.get(s) || 0})`,
              }))}
              active={tab}
              onChange={(id) => setTab(id as 'All' | FeeStatus)}
            />

            {rows.length === 0 ? (
              <EmptyState title="No fee vouchers" hint="No vouchers match the selected period and status." />
            ) : (
              <Table
                head={['Voucher #', 'Student', 'Class', 'Month', 'Total', 'Paid', 'Due', 'Status']}
              >
            {rows.map((f) => {
              const s = studentMap.get(f.studentId);
              return (
                <tr key={f.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2 font-semibold text-slate-800 whitespace-nowrap">
                    {f.voucherNumber}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Avatar src={s?.photo} name={s?.name || 'Unknown'} size={32} />
                      <div>
                        <div className="font-semibold text-slate-800">{s?.name || 'Unknown'}</div>
                        <div className="text-[11px] text-slate-400">{s?.rollNumber || ''}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-slate-600 whitespace-nowrap">
                    {s ? `${s.class}-${s.section}` : '—'}
                  </td>
                  <td className="px-3 py-2 text-slate-600 whitespace-nowrap">
                    {monthLabel(f.month)}
                  </td>
                  <td className="px-3 py-2 font-semibold text-slate-800 whitespace-nowrap">
                    {formatPKR(f.totalAmount)}
                  </td>
                  <td className="px-3 py-2 text-emerald-700 font-semibold whitespace-nowrap">
                    {formatPKR(f.paidAmount)}
                  </td>
                  <td className="px-3 py-2 text-rose-700 font-semibold whitespace-nowrap">
                    {formatPKR(f.dueAmount)}
                  </td>
                  <td className="px-3 py-2">
                    <Badge tone={statusTone[f.status]}>{f.status}</Badge>
                  </td>
                </tr>
              );
            })}
              </Table>
            )}
          </>
        )}
      </div>
    </Card>
  );
};
