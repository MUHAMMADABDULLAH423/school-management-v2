import React, { useMemo, useState } from 'react';
import { PiggyBank, Wallet, TrendingUp, ReceiptText, ExternalLink } from 'lucide-react';
import {
  FeeVoucher, Student, DateFilterState, FeeStatus, monthInFilter, formatPKR,
} from '../types';
import { Card, CardHeader, Badge, EmptyState, Table, Tabs, Avatar } from './ui';
import { monthLabel } from './DateFilter';

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

  const studentMap = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);

  const filtered = useMemo(
    () => fees.filter((f) => monthInFilter(f.month, filter)),
    [fees, filter]
  );

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
      </div>
    </Card>
  );
};
