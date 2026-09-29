import React, { useMemo, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useCollection } from '../hooks/useFirestore';
import { AuditLogEntry } from '../types';
import { Badge, Card, CardHeader, EmptyState, Field, Select, Spinner, Table } from './ui';

const categoryTone = (c: string): 'green' | 'red' | 'amber' | 'blue' | 'slate' | 'violet' => {
  const t = c.toUpperCase();
  if (t === 'AUTH') return 'blue';
  if (t === 'ATTENDANCE') return 'green';
  if (t === 'FEES' || t === 'SALARY' || t === 'EXPENSES') return 'amber';
  if (t === 'MARKS') return 'violet';
  if (t === 'NOTICES' || t === 'DIARY') return 'slate';
  return 'slate';
};

function fmtTs(ts: string): string {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return ts || '—';
  return d.toLocaleString('en-PK', { dateStyle: 'medium', timeStyle: 'short' });
}

/**
 * Audit log viewer — admin & principal, read-only. Latest 200 entries.
 */
export const AuditLogView: React.FC = () => {
  const { data: entries, loading } = useCollection<AuditLogEntry>('auditLog');
  const [category, setCategory] = useState('ALL');

  const categories = useMemo(() => {
    const set = new Set<string>();
    entries.forEach((e) => { if (e.category) set.add(e.category); });
    return ['ALL', ...[...set].sort()];
  }, [entries]);

  const rows = useMemo(() => {
    let list = entries.slice().sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
    if (category !== 'ALL') list = list.filter((e) => e.category === category);
    return list.slice(0, 200);
  }, [entries, category]);

  if (loading) return <Spinner />;

  return (
    <Card>
      <CardHeader
        title="Audit Log"
        subtitle="Append-only record of important actions. Latest 200 shown."
        pill={`${rows.length}`}
        action={
          <div className="w-48">
            <Field label="Category">
              <Select value={category} onChange={(e) => setCategory(e.target.value)}>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </Field>
          </div>
        }
      />
      <div className="p-5">
        <div className="flex items-center gap-2 mb-4 text-xs text-slate-500">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          Entries are immutable — they cannot be edited or deleted.
        </div>
        {rows.length === 0 ? (
          <EmptyState title="No audit entries" hint="Actions like logins, attendance and fee collection appear here." />
        ) : (
          <Table head={['Time', 'User', 'Action', 'Category', 'Details']}>
            {rows.map((e) => (
              <tr key={e.id}>
                <td className="px-3 py-2 whitespace-nowrap text-slate-600">{fmtTs(e.timestamp)}</td>
                <td className="px-3 py-2 font-semibold text-slate-900 whitespace-nowrap">{e.userName}</td>
                <td className="px-3 py-2 text-slate-700">{e.action}</td>
                <td className="px-3 py-2"><Badge tone={categoryTone(e.category)}>{e.category}</Badge></td>
                <td className="px-3 py-2 text-slate-600 max-w-xs truncate" title={e.details}>{e.details}</td>
              </tr>
            ))}
          </Table>
        )}
      </div>
    </Card>
  );
};
