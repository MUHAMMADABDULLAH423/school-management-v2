import React, { useEffect, useRef, useState } from 'react';
import { addDoc, collection, doc, setDoc } from 'firebase/firestore';
import { CalendarDays, Camera, GraduationCap, ImagePlus, Landmark, Mail, MapPin, Pencil, Phone, Plus, Star, Trash2 } from 'lucide-react';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { useSchool } from '../hooks/useFirestore';
import { BankAccount } from '../types';
import { getCurrentPosition, geoErrorMessage } from '../utils/geo';
import {
  Badge, Card, CardHeader, Field, GhostButton, Modal,
  PrimaryButton, Spinner, TextInput, useConfirm,
} from './ui';

interface SchoolProfileProps {
  /** When true: no Card chrome; shows a "Complete school setup" heading. Save creates schools/main. */
  setupMode?: boolean;
}

interface ProfileForm {
  name: string;
  address: string;
  contact: string;
  email: string;
  affiliation: string;
  registrationNumber: string;
  academicYear: string;
  lat: string;
  lng: string;
  radius: string;
  logo: string;
}

interface BankForm {
  bankName: string;
  accountTitle: string;
  accountNumber: string;
  branch: string;
  iban: string;
  isDefault: boolean;
}

const emptyBankForm = (): BankForm => ({
  bankName: '', accountTitle: '', accountNumber: '', branch: '', iban: '', isDefault: false,
});

export const SchoolProfile: React.FC<SchoolProfileProps> = ({ setupMode = false }) => {
  const { currentUser } = useAuth();
  const { school, loading } = useSchool();
  const { ask, dialog } = useConfirm();

  const canEdit =
    currentUser?.role === 'principal' || currentUser?.role === 'admin';

  const [form, setForm] = useState<ProfileForm>({
    name: '', address: '', contact: '', email: '',
    affiliation: '', registrationNumber: '', academicYear: '',
    lat: '', lng: '', radius: '100', logo: '',
  });
  const [banks, setBanks] = useState<BankAccount[]>([]);
  const initialized = useRef(false);

  const [bankModalOpen, setBankModalOpen] = useState(false);
  const [editingBankId, setEditingBankId] = useState<string | null>(null);
  const [bankForm, setBankForm] = useState<BankForm>(emptyBankForm());
  const [bankError, setBankError] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [locating, setLocating] = useState(false);
  const [gpsMsg, setGpsMsg] = useState('');

  // Populate once when the school doc first loads (don't clobber user edits on realtime echoes).
  useEffect(() => {
    if (school && !initialized.current) {
      initialized.current = true;
      setForm({
        name: school.name || '',
        address: school.address || '',
        contact: school.contact || '',
        email: school.email || '',
        affiliation: school.affiliation || '',
        registrationNumber: school.registrationNumber || '',
        academicYear: school.academicYear || '',
        lat: school.gpsLocation ? String(school.gpsLocation.lat) : '',
        lng: school.gpsLocation ? String(school.gpsLocation.lng) : '',
        radius: school.gpsLocation ? String(school.gpsLocation.radius) : '100',
        logo: school.logo || '',
      });
      setBanks(school.bankAccounts || []);
    }
  }, [school]);

  const logAudit = async (action: string, details: string) => {
    if (!currentUser) return;
    try {
      await addDoc(collection(db, 'auditLog'), {
        userId: currentUser.uid,
        userName: currentUser.name,
        action,
        category: 'SCHOOL',
        details,
        timestamp: new Date().toISOString(),
      });
    } catch {
      /* audit must never break the UI */
    }
  };

  const setField = <K extends keyof ProfileForm>(k: K, v: ProfileForm[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setSaved(false);
  };

  /** Fill lat/lng from the device GPS. Principal should stand at the school when pressing this. */
  const captureLocation = async () => {
    setGpsMsg('');
    setLocating(true);
    try {
      const pos = await getCurrentPosition();
      setField('lat', pos.coords.latitude.toFixed(6));
      setField('lng', pos.coords.longitude.toFixed(6));
      setGpsMsg(
        `Location captured (±${Math.round(pos.coords.accuracy)} m accuracy). Set your radius and press Save.`
      );
    } catch (e) {
      setGpsMsg(geoErrorMessage(e));
    } finally {
      setLocating(false);
    }
  };

  /* ---------- School logo: client-resized base64 (no Storage needed) ---------- */
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [logoUploading, setLogoUploading] = useState(false);

  const handleLogoFile = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file for the logo.');
      return;
    }
    setLogoUploading(true);
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const max = 256;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d')?.drawImage(img, 0, 0, w, h);
        const outType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
        setField('logo', canvas.toDataURL(outType, 0.9));
      } catch {
        setError('Could not process the logo image. Try another file.');
      } finally {
        URL.revokeObjectURL(url);
        setLogoUploading(false);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setLogoUploading(false);
      setError('Could not read the logo image. Try another file.');
    };
    img.src = url;
  };

  const save = async () => {
    if (!canEdit) return;
    if (!form.name.trim()) return setError('School name is required.');
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        address: form.address.trim(),
        contact: form.contact.trim(),
        email: form.email.trim(),
        affiliation: form.affiliation.trim(),
        registrationNumber: form.registrationNumber.trim(),
        academicYear: form.academicYear.trim(),
        gpsLocation: {
          lat: parseFloat(form.lat) || 0,
          lng: parseFloat(form.lng) || 0,
          radius: parseFloat(form.radius) || 100,
        },
        logo: form.logo.trim(),
        bankAccounts: banks,
      };
      if (!school) payload.createdAt = new Date().toISOString();
      await setDoc(doc(db, 'schools', 'main'), payload, { merge: true });
      await logAudit(
        school ? 'School profile updated' : 'School profile created',
        `${form.name.trim()} — ${banks.length} bank account(s)`
      );
      setSaved(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  /* ---------- Bank accounts ---------- */

  const openAddBank = () => {
    setEditingBankId(null);
    setBankForm(emptyBankForm());
    setBankError('');
    setBankModalOpen(true);
  };

  const openEditBank = (b: BankAccount) => {
    setEditingBankId(b.id);
    setBankForm({
      bankName: b.bankName || '',
      accountTitle: b.accountTitle || '',
      accountNumber: b.accountNumber || '',
      branch: b.branch || '',
      iban: b.iban || '',
      isDefault: !!b.isDefault,
    });
    setBankError('');
    setBankModalOpen(true);
  };

  const saveBank = () => {
    const bankName = bankForm.bankName.trim();
    const accountTitle = bankForm.accountTitle.trim();
    const accountNumber = bankForm.accountNumber.trim();
    if (!bankName) return setBankError('Bank name is required.');
    if (!accountTitle) return setBankError('Account title is required.');
    if (!accountNumber) return setBankError('Account number is required.');

    const id = editingBankId || `bank-${Date.now()}`;
    const next: BankAccount = {
      id,
      bankName,
      accountTitle,
      accountNumber,
      branch: bankForm.branch.trim(),
      iban: bankForm.iban.trim() || undefined,
      isDefault: bankForm.isDefault,
    };
    // Only one default: if this one is default, unset all others.
    // First-ever account becomes default automatically.
    const willBeDefault = next.isDefault || banks.length === 0;
    const updated = banks.some((b) => b.id === id)
      ? banks.map((b) =>
          b.id === id ? { ...next, isDefault: willBeDefault } : { ...b, isDefault: willBeDefault ? false : b.isDefault }
        )
      : [
          ...banks.map((b) => ({ ...b, isDefault: willBeDefault ? false : b.isDefault })),
          { ...next, isDefault: willBeDefault },
        ];
    setBanks(updated);
    setBankModalOpen(false);
    setSaved(false);
  };

  const deleteBank = (b: BankAccount) => {
    ask({
      title: 'Delete bank account',
      message: `Delete the ${b.bankName} account (${b.accountNumber})? Fee vouchers will no longer show it.`,
      confirmLabel: 'Delete',
      onConfirm: () => {
        const remaining = banks.filter((x) => x.id !== b.id);
        // If the deleted account was the default, promote the first remaining one.
        if (b.isDefault && remaining.length > 0 && !remaining.some((x) => x.isDefault)) {
          remaining[0] = { ...remaining[0], isDefault: true };
        }
        setBanks(remaining);
        setSaved(false);
      },
    });
  };

  const setDefaultBank = (id: string) => {
    setBanks((prev) => prev.map((b) => ({ ...b, isDefault: b.id === id })));
    setSaved(false);
  };

  const setBankField = <K extends keyof BankForm>(k: K, v: BankForm[K]) =>
    setBankForm((f) => ({ ...f, [k]: v }));

  const formBody = (
    <>
      <div className="mb-5">
        <span className="block text-xs font-semibold text-slate-600 mb-1">School logo</span>
        <div className="flex items-center gap-4">
          <div className="relative w-20 h-20 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden shrink-0">
            {form.logo ? (
              <img src={form.logo} alt="School logo" className="w-full h-full object-contain" />
            ) : (
              <ImagePlus className="w-8 h-8 text-slate-300" />
            )}
            {logoUploading && (
              <div className="absolute inset-0 bg-slate-900/50 flex items-center justify-center">
                <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              </div>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex gap-2">
              <button
                type="button"
                disabled={!canEdit || logoUploading}
                onClick={() => logoInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 text-xs font-semibold rounded-lg transition-colors"
              >
                <Camera className="w-3.5 h-3.5" />
                {form.logo ? 'Change logo' : 'Upload logo'}
              </button>
              {form.logo && (
                <button
                  type="button"
                  disabled={!canEdit || logoUploading}
                  onClick={() => setField('logo', '')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 disabled:opacity-50 text-rose-700 text-xs font-semibold rounded-lg transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Remove
                </button>
              )}
            </div>
            <span className="text-[11px] text-slate-400">
              Shows next to the school name on every portal. PNG/JPG, auto-resized.
            </span>
          </div>
        </div>
        <input
          ref={logoInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => handleLogoFile(e.target.files?.[0])}
        />
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <Field label="School name *">
          <TextInput value={form.name} onChange={(e) => setField('name', e.target.value)} disabled={!canEdit} placeholder="e.g. Green Wood School" />
        </Field>
        <Field label="Contact phone">
          <TextInput value={form.contact} onChange={(e) => setField('contact', e.target.value)} disabled={!canEdit} placeholder="e.g. 042 3577 0000" />
        </Field>
        <div className="md:col-span-2">
          <Field label="Address">
            <TextInput value={form.address} onChange={(e) => setField('address', e.target.value)} disabled={!canEdit} placeholder="e.g. Main Boulevard, Gulberg, Lahore" />
          </Field>
        </div>
        <Field label="Email">
          <TextInput type="email" value={form.email} onChange={(e) => setField('email', e.target.value)} disabled={!canEdit} placeholder="e.g. info@school.pk" />
        </Field>
        <Field label="Academic year">
          <TextInput value={form.academicYear} onChange={(e) => setField('academicYear', e.target.value)} disabled={!canEdit} placeholder="e.g. 2026-27" />
        </Field>
        <Field label="Affiliation">
          <TextInput value={form.affiliation} onChange={(e) => setField('affiliation', e.target.value)} disabled={!canEdit} placeholder="e.g. BISE Lahore" />
        </Field>
        <Field label="Registration number">
          <TextInput value={form.registrationNumber} onChange={(e) => setField('registrationNumber', e.target.value)} disabled={!canEdit} placeholder="e.g. REG-2026-0001" />
        </Field>
      </div>

      <div className="mt-6">
        <div className="flex items-start justify-between gap-3 mb-1">
          <div>
            <h4 className="text-sm font-bold text-slate-800">GPS location</h4>
            <p className="text-xs text-slate-500">Used for location-verified attendance. Radius is in metres.</p>
          </div>
          {canEdit && (
            <GhostButton
              onClick={captureLocation}
              disabled={locating}
              className="!px-3 !py-1.5 text-xs shrink-0"
            >
              <MapPin className="w-4 h-4" /> {locating ? 'Locating…' : 'Use current location'}
            </GhostButton>
          )}
        </div>
        {gpsMsg && (
          <div className="mb-3 px-3 py-2 rounded-lg bg-indigo-50 border border-indigo-200 text-xs text-indigo-800">
            {gpsMsg}
          </div>
        )}
        <p className="text-[11px] text-slate-400 mb-3">
          Tip: press "Use current location" while standing at the school gate for best accuracy, then set the radius and Save.
        </p>
        <div className="grid grid-cols-3 gap-4">
          <Field label="Latitude">
            <TextInput type="number" step="any" value={form.lat} onChange={(e) => setField('lat', e.target.value)} disabled={!canEdit} placeholder="31.5204" />
          </Field>
          <Field label="Longitude">
            <TextInput type="number" step="any" value={form.lng} onChange={(e) => setField('lng', e.target.value)} disabled={!canEdit} placeholder="74.3587" />
          </Field>
          <Field label="Radius (m)">
            <TextInput type="number" min="10" value={form.radius} onChange={(e) => setField('radius', e.target.value)} disabled={!canEdit} placeholder="100" />
          </Field>
        </div>
      </div>

      <div className="mt-6">
        <div className="flex items-center justify-between mb-1">
          <div>
            <h4 className="text-sm font-bold text-slate-800">Bank accounts</h4>
            <p className="text-xs text-slate-500">The default account is printed on fee vouchers for fee collection.</p>
          </div>
          {canEdit && (
            <GhostButton onClick={openAddBank} className="!px-3 !py-1.5 text-xs">
              <Plus className="w-4 h-4" /> Add account
            </GhostButton>
          )}
        </div>
        {banks.length === 0 ? (
          <div className="border border-dashed border-slate-300 rounded-xl p-6 text-center text-sm text-slate-500">
            <Landmark className="w-6 h-6 mx-auto mb-1 text-slate-300" />
            No bank accounts yet. Add one so fee vouchers show where to pay.
          </div>
        ) : (
          <div className="space-y-2">
            {banks.map((b) => (
              <div
                key={b.id}
                className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 border rounded-xl px-4 py-3 ${
                  b.isDefault ? 'border-emerald-300 bg-emerald-50/50' : 'border-slate-200 bg-white'
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-slate-900 text-sm">{b.bankName}</span>
                    {b.isDefault && <Badge tone="green">Default</Badge>}
                  </div>
                  <div className="text-xs text-slate-600 mt-0.5">
                    A/C {b.accountTitle}: <span className="font-mono font-semibold">{b.accountNumber}</span>
                    {b.branch && <span className="text-slate-500"> · {b.branch} branch</span>}
                    {b.iban && <span className="text-slate-500 block font-mono">IBAN: {b.iban}</span>}
                  </div>
                </div>
                {canEdit && (
                  <div className="flex items-center gap-1 shrink-0">
                    {!b.isDefault && (
                      <button
                        type="button"
                        onClick={() => setDefaultBank(b.id)}
                        title="Set as default"
                        className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold text-slate-500 hover:bg-emerald-50 hover:text-emerald-700"
                      >
                        <Star className="w-4 h-4" /> Set default
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => openEditBank(b)}
                      title="Edit"
                      className="inline-flex p-1.5 rounded-lg text-slate-500 hover:bg-indigo-50 hover:text-indigo-700"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteBank(b)}
                      title="Delete"
                      className="inline-flex p-1.5 rounded-lg text-slate-500 hover:bg-rose-50 hover:text-rose-700"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {error && (
        <div className="mt-4 text-sm font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
          {error}
        </div>
      )}
      {saved && (
        <div className="mt-4 text-sm font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
          School profile saved.
        </div>
      )}
      {!canEdit && (
        <div className="mt-4 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
          You are viewing in read-only mode — only the principal or admin can edit the school profile.
        </div>
      )}

      {canEdit && (
        <div className="flex justify-end mt-6">
          <PrimaryButton onClick={save} disabled={saving}>
            {saving ? 'Saving…' : setupMode ? 'Complete setup' : 'Save profile'}
          </PrimaryButton>
        </div>
      )}

      {bankModalOpen && (
        <Modal
          title={editingBankId ? 'Edit bank account' : 'Add bank account'}
          subtitle="This account can be printed on fee vouchers."
          onClose={() => setBankModalOpen(false)}
        >
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Bank name *">
              <TextInput value={bankForm.bankName} onChange={(e) => setBankField('bankName', e.target.value)} placeholder="e.g. Meezan Bank" />
            </Field>
            <Field label="Account title *">
              <TextInput value={bankForm.accountTitle} onChange={(e) => setBankField('accountTitle', e.target.value)} placeholder="e.g. Green Wood School" />
            </Field>
            <Field label="Account number *">
              <TextInput value={bankForm.accountNumber} onChange={(e) => setBankField('accountNumber', e.target.value)} placeholder="e.g. 0101 0101234567" className="font-mono" />
            </Field>
            <Field label="Branch">
              <TextInput value={bankForm.branch} onChange={(e) => setBankField('branch', e.target.value)} placeholder="e.g. Gulberg" />
            </Field>
            <div className="md:col-span-2">
              <Field label="IBAN (optional)">
                <TextInput value={bankForm.iban} onChange={(e) => setBankField('iban', e.target.value)} placeholder="e.g. PK36MEZN0001010101234567" className="font-mono" />
              </Field>
            </div>
            <div className="md:col-span-2">
              <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={bankForm.isDefault}
                  onChange={(e) => setBankField('isDefault', e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                Set as default account (printed on fee vouchers)
              </label>
            </div>
          </div>

          {bankError && (
            <div className="mt-4 text-sm font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
              {bankError}
            </div>
          )}

          <div className="flex justify-end gap-2 mt-6">
            <GhostButton onClick={() => setBankModalOpen(false)}>Cancel</GhostButton>
            <PrimaryButton onClick={saveBank}>{editingBankId ? 'Save changes' : 'Add account'}</PrimaryButton>
          </div>
        </Modal>
      )}

      {dialog}
    </>
  );

  if (loading) {
    return (
      <Card>
        <Spinner />
      </Card>
    );
  }

  if (setupMode) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <h2 className="text-xl font-extrabold text-slate-900">Complete school setup</h2>
          <p className="text-sm text-slate-500 mt-1">
            Enter your school’s details and a bank account for fee collection. You can change these later from School Profile.
          </p>
        </div>
        {formBody}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Colorful profile banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 text-white shadow-lg">
        <div className="absolute -top-20 -right-16 w-72 h-72 rounded-full bg-white/10" />
        <div className="absolute -bottom-24 -left-12 w-64 h-64 rounded-full bg-white/10" />
        <div className="absolute top-10 left-1/3 w-24 h-24 rounded-full bg-white/5" />
        <div className="relative p-6 flex flex-col sm:flex-row sm:items-center gap-5">
          <div className="w-20 h-20 rounded-2xl bg-white p-1.5 shadow-lg shrink-0 overflow-hidden">
            {form.logo ? (
              <img src={form.logo} alt="School logo" className="w-full h-full object-contain" />
            ) : (
              <div className="w-full h-full rounded-xl bg-indigo-100 flex items-center justify-center">
                <GraduationCap className="w-8 h-8 text-indigo-600" />
              </div>
            )}
          </div>
          <div className="min-w-0">
            <h3 className="text-2xl font-extrabold truncate">{form.name.trim() || 'Your School'}</h3>
            {form.address.trim() && (
              <p className="text-sm text-white/85 truncate mt-0.5 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{form.address.trim()}</span>
              </p>
            )}
            <div className="flex flex-wrap gap-2 mt-3">
              {form.contact.trim() && (
                <span className="inline-flex items-center gap-1.5 bg-white/15 rounded-full px-3 py-1 text-xs font-semibold">
                  <Phone className="w-3 h-3" /> {form.contact.trim()}
                </span>
              )}
              {form.email.trim() && (
                <span className="inline-flex items-center gap-1.5 bg-white/15 rounded-full px-3 py-1 text-xs font-semibold">
                  <Mail className="w-3 h-3" /> {form.email.trim()}
                </span>
              )}
              {form.academicYear.trim() && (
                <span className="inline-flex items-center gap-1.5 bg-white/15 rounded-full px-3 py-1 text-xs font-semibold">
                  <CalendarDays className="w-3 h-3" /> {form.academicYear.trim()}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader
          title="School Profile"
          subtitle="School details and bank accounts for fee collection."
        />
        <div className="p-5">{formBody}</div>
      </Card>
    </div>
  );
};

export default SchoolProfile;
