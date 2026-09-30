import React, { useState } from 'react';
import { Search, X, AlertTriangle, Eye, EyeOff } from 'lucide-react';

/* ---------- Layout primitives ---------- */

export const Card: React.FC<{ className?: string; children: React.ReactNode }> = ({
  className = '',
  children,
}) => (
  <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm ${className}`}>
    {children}
  </div>
);

export const CardHeader: React.FC<{
  title: string;
  subtitle?: string;
  pill?: string;
  action?: React.ReactNode;
}> = ({ title, subtitle, pill, action }) => (
  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
    <div>
      <div className="flex items-center gap-2">
        <h3 className="text-base font-bold text-slate-900">{title}</h3>
        {pill && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-semibold border border-slate-200">
            {pill}
          </span>
        )}
      </div>
      {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
    </div>
    {action}
  </div>
);

export const StatCard: React.FC<{
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  tone?: 'indigo' | 'emerald' | 'rose' | 'amber' | 'sky' | 'violet';
}> = ({ label, value, sub, icon, tone = 'indigo' }) => {
  const tones: Record<string, string> = {
    indigo: 'bg-indigo-50 text-indigo-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    rose: 'bg-rose-50 text-rose-600',
    amber: 'bg-amber-50 text-amber-600',
    sky: 'bg-sky-50 text-sky-600',
    violet: 'bg-violet-50 text-violet-600',
  };
  return (
    <Card className="p-4 flex items-center gap-3">
      <div className={`p-2.5 rounded-xl ${tones[tone]}`}>{icon}</div>
      <div className="min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
        <div className="text-xl font-extrabold text-slate-900 truncate">{value}</div>
        {sub && <div className="text-[11px] text-slate-500">{sub}</div>}
      </div>
    </Card>
  );
};

/* ---------- Form primitives ---------- */

export const Field: React.FC<{
  label: string;
  children: React.ReactNode;
  className?: string;
}> = ({ label, children, className = '' }) => (
  <label className={`block ${className}`}>
    <span className="block text-xs font-semibold text-slate-600 mb-1">{label}</span>
    {children}
  </label>
);

export const inputCls =
  'w-full px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-slate-100';

export const TextInput = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>((props, ref) => <input ref={ref} {...props} className={`${inputCls} ${props.className || ''}`} />);
TextInput.displayName = 'TextInput';

/** Password input with a show/hide eye toggle. */
export const PasswordInput: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (props) => {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        {...props}
        type={show ? 'text' : 'password'}
        className={`${inputCls} pr-10 ${props.className || ''}`}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-md text-slate-400 hover:text-slate-700"
        aria-label={show ? 'Hide password' : 'Show password'}
        tabIndex={-1}
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
};

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>((props, ref) => (
  <select ref={ref} {...props} className={`${inputCls} ${props.className || ''}`} />
));
Select.displayName = 'Select';

export const TextArea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>((props, ref) => (
  <textarea ref={ref} {...props} className={`${inputCls} ${props.className || ''}`} />
));
TextArea.displayName = 'TextArea';

export const PrimaryButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({
  className = '',
  ...props
}) => (
  <button
    {...props}
    className={`inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors ${className}`}
  />
);

export const GhostButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({
  className = '',
  ...props
}) => (
  <button
    {...props}
    className={`inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-lg transition-colors ${className}`}
  />
);

export const DangerButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({
  className = '',
  ...props
}) => (
  <button
    {...props}
    className={`inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors ${className}`}
  />
);

/* ---------- Feedback primitives ---------- */

export const Badge: React.FC<{ tone?: 'green' | 'red' | 'amber' | 'blue' | 'slate' | 'violet'; children: React.ReactNode }> = ({
  tone = 'slate',
  children,
}) => {
  const tones: Record<string, string> = {
    green: 'bg-emerald-100 text-emerald-800',
    red: 'bg-rose-100 text-rose-800',
    amber: 'bg-amber-100 text-amber-800',
    blue: 'bg-blue-100 text-blue-800',
    slate: 'bg-slate-100 text-slate-700',
    violet: 'bg-violet-100 text-violet-800',
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold ${tones[tone]}`}>
      {children}
    </span>
  );
};

export const EmptyState: React.FC<{ title: string; hint?: string }> = ({ title, hint }) => (
  <div className="py-10 text-center">
    <div className="text-slate-300 text-4xl mb-2">📋</div>
    <div className="text-sm font-semibold text-slate-600">{title}</div>
    {hint && <div className="text-xs text-slate-400 mt-1">{hint}</div>}
  </div>
);

export const Spinner: React.FC = () => (
  <div className="flex items-center justify-center py-10">
    <div className="w-8 h-8 border-3 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
  </div>
);

export const Avatar: React.FC<{ src?: string; name: string; size?: number }> = ({
  src,
  name,
  size = 40,
}) => {
  const initials = name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className="rounded-full object-cover bg-slate-200"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials}
    </div>
  );
};

export const SearchInput: React.FC<{
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}> = ({ value, onChange, placeholder = 'Search…' }) => (
  <div className="relative">
    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`${inputCls} pl-9`}
    />
  </div>
);

/* ---------- Modal ---------- */

export const Modal: React.FC<{
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}> = ({ title, subtitle, onClose, children, wide }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 overflow-y-auto">
    <div
      className={`bg-white w-full ${wide ? 'max-w-4xl' : 'max-w-2xl'} rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-8`}
    >
      <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white">
        <div>
          <h3 className="font-bold text-sm">{title}</h3>
          {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="p-6 max-h-[75vh] overflow-y-auto nice-scroll">{children}</div>
    </div>
  </div>
);

export const ConfirmDialog: React.FC<{
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ title, message, confirmLabel = 'Delete', onConfirm, onCancel }) => (
  <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/70">
    <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl border border-slate-200 p-6">
      <div className="flex items-center gap-2 mb-2">
        <AlertTriangle className="w-5 h-5 text-rose-600" />
        <h3 className="font-bold text-slate-900">{title}</h3>
      </div>
      <p className="text-sm text-slate-600 mb-5">{message}</p>
      <div className="flex justify-end gap-2">
        <GhostButton onClick={onCancel}>Cancel</GhostButton>
        <DangerButton onClick={onConfirm}>{confirmLabel}</DangerButton>
      </div>
    </div>
  </div>
);

/* ---------- Tabs ---------- */

export const Tabs: React.FC<{
  tabs: { id: string; label: string; icon?: React.ReactNode }[];
  active: string;
  onChange: (id: string) => void;
}> = ({ tabs, active, onChange }) => (
  <div className="flex gap-1 overflow-x-auto nice-scroll border-b border-slate-200 mb-5">
    {tabs.map((t) => (
      <button
        key={t.id}
        type="button"
        onClick={() => onChange(t.id)}
        className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors ${
          active === t.id
            ? 'border-indigo-600 text-indigo-700'
            : 'border-transparent text-slate-500 hover:text-slate-800'
        }`}
      >
        {t.icon}
        {t.label}
      </button>
    ))}
  </div>
);

/* ---------- Table ---------- */

export const Table: React.FC<{
  head: string[];
  children: React.ReactNode;
}> = ({ head, children }) => (
  <div className="overflow-x-auto nice-scroll">
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-slate-200 text-left">
          {head.map((h) => (
            <th key={h} className="px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-500 whitespace-nowrap">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">{children}</tbody>
    </table>
  </div>
);

export function useConfirm() {
  const [state, setState] = useState<{
    title: string;
    message: string;
    confirmLabel?: string;
    onConfirm: () => void;
  } | null>(null);
  const ask = (opts: {
    title: string;
    message: string;
    confirmLabel?: string;
    onConfirm: () => void;
  }) => setState(opts);
  const dialog = state ? (
    <ConfirmDialog
      title={state.title}
      message={state.message}
      confirmLabel={state.confirmLabel}
      onConfirm={() => {
        setState(null);
        state.onConfirm();
      }}
      onCancel={() => setState(null)}
    />
  ) : null;
  return { ask, dialog };
}
