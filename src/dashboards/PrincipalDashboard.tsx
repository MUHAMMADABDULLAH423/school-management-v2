import React, { useState } from 'react';
import {
  LayoutDashboard, Users, School, ReceiptText, ScrollText,
} from 'lucide-react';
import { ExecutiveDashboard } from '../components/ExecutiveDashboard';
import { StaffManager } from '../components/StaffManager';
import { SchoolProfile } from '../components/SchoolProfile';
import { AuditLogView } from '../components/AuditLogView';
import { FeeOverview } from '../components/FeeOverview';
import { DateFilter, filterLabelFor } from '../components/DateFilter';
import { Tabs, Card, Spinner } from '../components/ui';
import { useCollection } from '../hooks/useFirestore';
import { FeeVoucher, Student, defaultDateFilter } from '../types';

/**
 * Principal dashboard.
 * NOTE: the principal must NEVER see any student admission UI — admissions
 * belong to the admin. The principal gets teacher/staff management, school
 * profile, read-only fee and audit views.
 */

/** Read-only fee view for the principal (no fee-center navigation). */
const PrincipalFeeView: React.FC = () => {
  const [filter, setFilter] = useState(defaultDateFilter());
  const { data: fees, loading: l1 } = useCollection<FeeVoucher>('fees');
  const { data: students, loading: l2 } = useCollection<Student>('students');

  if (l1 || l2) return <Spinner />;

  return (
    <div className="space-y-5">
      <DateFilter filter={filter} onChange={setFilter} />
      <FeeOverview
        fees={fees}
        students={students}
        filter={filter}
        filterLabel={filterLabelFor(filter)}
      />
      <Card className="px-5 py-3">
        <p className="text-xs text-slate-500">
          Read-only view. Fee voucher generation and payment collection are restricted to the
          administrator.
        </p>
      </Card>
    </div>
  );
};

const iconCls = 'w-4 h-4';

export const PrincipalDashboard: React.FC<{ initialTab?: string }> = ({ initialTab }) => {
  const [activeTab, setActiveTab] = useState(initialTab || 'overview');

  const tabs = [
    { id: 'overview', label: 'Executive Overview', icon: <LayoutDashboard className={iconCls} /> },
    { id: 'staff', label: 'Teachers & Staff', icon: <Users className={iconCls} /> },
    { id: 'school', label: 'School Profile', icon: <School className={iconCls} /> },
    { id: 'fees', label: 'Fee Overview', icon: <ReceiptText className={iconCls} /> },
    { id: 'audit', label: 'Audit Log', icon: <ScrollText className={iconCls} /> },
  ];

  return (
    <div>
      <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />
      {activeTab === 'overview' && <ExecutiveDashboard />}
      {activeTab === 'staff' && <StaffManager />}
      {activeTab === 'school' && <SchoolProfile />}
      {activeTab === 'fees' && <PrincipalFeeView />}
      {activeTab === 'audit' && <AuditLogView />}
    </div>
  );
};
