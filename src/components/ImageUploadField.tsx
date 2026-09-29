import React, { useRef, useState } from 'react';
import { Camera, Trash2 } from 'lucide-react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../config/firebase';
import { Avatar } from './ui';

interface ImageUploadFieldProps {
  value?: string;
  onChange: (url: string) => void;
  /** Stable id for the Storage path. For NEW records the parent must generate
   *  this ONCE (e.g. `new-${Date.now()}` in modal-open state) so re-renders
   *  don't orphan uploads in different folders. */
  recordId: string;
  label?: string;
}

const MAX_BYTES = 2 * 1024 * 1024;

export const ImageUploadField: React.FC<ImageUploadFieldProps> = ({
  value,
  onChange,
  recordId,
  label = 'Photo',
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const handleFile = async (file: File | undefined) => {
    setError('');
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError('Image must be 2 MB or smaller.');
      return;
    }
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const folder = recordId && recordId.trim() ? recordId.trim() : 'unassigned';
    const path = `profiles/${folder}/${Date.now()}_${safeName}`;
    setUploading(true);
    try {
      const snap = await uploadBytes(ref(storage, path), file);
      const url = await getDownloadURL(snap.ref);
      onChange(url);
    } catch (e: any) {
      setError(e?.message || 'Upload failed. Try again.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <span className="block text-xs font-semibold text-slate-600 mb-1">{label}</span>
      <div className="flex items-center gap-3">
        <div className="relative">
          <Avatar src={value} name={label} size={64} />
          {uploading && (
            <div className="absolute inset-0 rounded-full bg-slate-900/50 flex items-center justify-center">
              <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex gap-2">
            <button
              type="button"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 text-xs font-semibold rounded-lg transition-colors"
            >
              <Camera className="w-3.5 h-3.5" />
              {value ? 'Change photo' : 'Upload photo'}
            </button>
            {value && (
              <button
                type="button"
                disabled={uploading}
                onClick={() => onChange('')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 disabled:opacity-50 text-rose-700 text-xs font-semibold rounded-lg transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Remove
              </button>
            )}
          </div>
          <span className="text-[11px] text-slate-400">JPG/PNG, max 2 MB</span>
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      {error && <div className="text-xs text-rose-600 mt-1">{error}</div>}
    </div>
  );
};
