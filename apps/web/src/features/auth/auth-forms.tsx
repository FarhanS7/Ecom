'use client';

// Shared auth form primitives (T017b): labelled fields, announced server
// errors, and nonsecret preservation. Passwords live in component state only:
// never localStorage/sessionStorage (proven by grep, not by promise), and
// cleared after every submit while nonsecret fields persist.

import { useState } from 'react';
import type { CSSProperties, FormEvent, ReactNode } from 'react';

const fieldStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--spacing-xs)',
  marginBottom: 'var(--spacing-md)',
};

const inputStyle: CSSProperties = {
  padding: 'var(--spacing-sm) var(--spacing-md)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-md)',
  fontSize: '1rem',
  minHeight: '44px',
};

const errorStyle: CSSProperties = {
  color: 'var(--color-error)',
  fontSize: '0.875rem',
};

export function Field({
  label,
  name,
  type = 'text',
  value,
  onChange,
  required = true,
  minLength,
  autoComplete,
  error,
}: {
  label: string;
  name: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  minLength?: number;
  autoComplete?: string;
  error?: string;
}) {
  const errorId = error ? `${name}-error` : undefined;
  return (
    <div style={fieldStyle}>
      <label htmlFor={name}>{label}</label>
      <input
        id={name}
        name={name}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        minLength={minLength}
        autoComplete={autoComplete}
        aria-invalid={error ? true : undefined}
        aria-describedby={errorId}
        style={inputStyle}
      />
      {error ? (
        <span id={errorId} style={errorStyle} role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

export interface AuthSubmit {
  ok: boolean;
  detail: string;
}

export function useAuthForm(): {
  serverError: string | null;
  pending: boolean;
  submit: (action: () => Promise<AuthSubmit>) => Promise<AuthSubmit>;
} {
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(action: () => Promise<AuthSubmit>): Promise<AuthSubmit> {
    setServerError(null);
    setPending(true);
    try {
      const result = await action();
      if (!result.ok) setServerError(result.detail);
      return result;
    } catch {
      const fallback = { ok: false, detail: 'Something went wrong. Try again.' };
      setServerError(fallback.detail);
      return fallback;
    } finally {
      setPending(false);
    }
  }

  return { serverError, pending, submit };
}

export function AuthShell({
  title,
  children,
  onSubmit,
  submitLabel,
  pending,
}: {
  title: string;
  children: ReactNode;
  onSubmit: (e: FormEvent) => void;
  submitLabel: string;
  pending: boolean;
}) {
  return (
    <section aria-labelledby="auth-title">
      <h1 id="auth-title">{title}</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(e);
        }}
        noValidate={false}
      >
        {children}
        <button
          type="submit"
          disabled={pending}
          aria-busy={pending}
          style={{
            padding: 'var(--spacing-sm) var(--spacing-lg)',
            background: 'var(--color-primary)',
            color: 'white',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            minHeight: '44px',
            cursor: pending ? 'wait' : 'pointer',
          }}
        >
          {pending ? 'Working…' : submitLabel}
        </button>
      </form>
    </section>
  );
}
