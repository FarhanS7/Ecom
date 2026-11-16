'use client';

// @shopscale/web features/returns/return-reason-selector - Preset return reasons dropdown (T059).
import { SelectField } from '@/components/ui';

export const RETURN_REASONS = [
  'Defective or damaged item',
  'Wrong item sent',
  'Changed mind / no longer needed',
  'Item does not match description',
  'Other',
] as const;

export interface ReturnReasonSelectorProps {
  value: string;
  onChange: (value: string) => void;
  error?: string | undefined;
  disabled?: boolean | undefined;
}

export function ReturnReasonSelector({
  value,
  onChange,
  error,
}: ReturnReasonSelectorProps) {
  const options = RETURN_REASONS.map((r) => ({ value: r, label: r }));

  return (
    <SelectField
      label="Reason for return"
      name="return-reason"
      value={value}
      onChange={onChange}
      options={options}
      error={error}
    />
  );
}
