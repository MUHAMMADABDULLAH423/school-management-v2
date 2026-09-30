import React from 'react';
import { GraduationCap } from 'lucide-react';
import { useSchool } from '../hooks/useFirestore';

/**
 * School brand mark shown next to the school name on every portal.
 * Shows the uploaded school logo when one exists, otherwise the
 * default graduation-cap icon.
 */
export const SchoolBrand: React.FC<{ size?: number }> = ({ size = 32 }) => {
  const { school } = useSchool();

  if (school?.logo) {
    return (
      <img
        src={school.logo}
        alt="School logo"
        className="rounded-lg bg-white object-contain shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="rounded-lg bg-indigo-600 flex items-center justify-center shrink-0"
      style={{ width: size, height: size }}
    >
      <GraduationCap
        className="text-white"
        style={{ width: size / 2, height: size / 2 }}
      />
    </div>
  );
};
