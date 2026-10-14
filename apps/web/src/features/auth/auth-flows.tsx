'use client';

// Concrete auth forms (T017b). Every submit goes same-origin through the
// gateway (csrfFetch); session cookies ride automatically. Email persists
// across failed submits; passwords clear (never re-rendered, never stored).

import { useState } from 'react';
import { csrfFetch } from '@/lib/csrf';
import { AuthShell, Field, useAuthForm } from './auth-forms';

async function postForm(path: string, body: unknown): Promise<{ status: number; payload: unknown }> {
  const res = await csrfFetch(path, body);
  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }
  return { status: res.status, payload };
}

function problemDetail(payload: unknown, fallback: string): string {
  if (typeof payload === 'object' && payload !== null) {
    const record = payload as Record<string, unknown>;
    if (typeof record['detail'] === 'string') return record['detail'];
    if (typeof record['title'] === 'string') return record['title'];
  }
  return fallback;
}

export function RegisterForm({ onDone }: { onDone: (email: string) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { serverError, pending, submit } = useAuthForm();

  return (
    <AuthShell
      title="Create your account"
      submitLabel="Register"
      pending={pending}
      onSubmit={() => {
        void submit(async () => {
          const { status, payload } = await postForm('/api/v1/auth/register', { email, password });
          setPassword('');
          if (status === 201) {
            onDone(email);
            return { ok: true, detail: '' };
          }
          return { ok: false, detail: problemDetail(payload, 'Registration failed.') };
        });
      }}
    >
      <Field label="Email" name="email" type="email" value={email} onChange={setEmail} autoComplete="email" />
      <Field
        label="Password (8+ characters)"
        name="password"
        type="password"
        value={password}
        onChange={setPassword}
        minLength={8}
        autoComplete="new-password"
      />
      {serverError ? (
        <p role="alert" style={{ color: 'var(--color-error)' }}>
          {serverError}
        </p>
      ) : null}
    </AuthShell>
  );
}

export function LoginForm({ onDone }: { onDone: (email: string) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { serverError, pending, submit } = useAuthForm();

  return (
    <AuthShell
      title="Log in"
      submitLabel="Log in"
      pending={pending}
      onSubmit={() => {
        void submit(async () => {
          const { status, payload } = await postForm('/api/v1/auth/login', { email, password });
          setPassword('');
          if (status === 200) {
            onDone(email);
            return { ok: true, detail: '' };
          }
          return { ok: false, detail: problemDetail(payload, 'Login failed.') };
        });
      }}
    >
      <Field label="Email" name="email" type="email" value={email} onChange={setEmail} autoComplete="email" />
      <Field
        label="Password"
        name="password"
        type="password"
        value={password}
        onChange={setPassword}
        autoComplete="current-password"
      />
      {serverError ? (
        <p role="alert" style={{ color: 'var(--color-error)' }}>
          {serverError}
        </p>
      ) : null}
      <p>
        <a href="/forgot-password">Forgot your password?</a>
      </p>
    </AuthShell>
  );
}

export function ResetRequestForm() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const { serverError, pending, submit } = useAuthForm();

  if (sent) {
    return (
      <section aria-labelledby="auth-title">
        <h1 id="auth-title">Check your inbox</h1>
        <p role="status">If that email has an account, a reset link is on its way in this demo.</p>
      </section>
    );
  }

  return (
    <AuthShell
      title="Reset your password"
      submitLabel="Send reset link"
      pending={pending}
      onSubmit={() => {
        void submit(async () => {
          const { status } = await postForm('/api/v1/auth/password-reset/request', { email });
          if (status === 202) {
            setSent(true);
            return { ok: true, detail: '' };
          }
          return { ok: false, detail: 'Request failed. Try again.' };
        });
      }}
    >
      <Field label="Email" name="email" type="email" value={email} onChange={setEmail} autoComplete="email" />
      {serverError ? (
        <p role="alert" style={{ color: 'var(--color-error)' }}>
          {serverError}
        </p>
      ) : null}
    </AuthShell>
  );
}

export function ResetConfirmForm({ token }: { token: string }) {
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const { serverError, pending, submit } = useAuthForm();

  if (done) {
    return (
      <section aria-labelledby="auth-title">
        <h1 id="auth-title">Password updated</h1>
        <p role="status">
          Your password is set. <a href="/login">Log in</a> with the new one.
        </p>
      </section>
    );
  }

  return (
    <AuthShell
      title="Choose a new password"
      submitLabel="Set password"
      pending={pending}
      onSubmit={() => {
        void submit(async () => {
          const { status, payload } = await postForm('/api/v1/auth/password-reset/confirm', {
            token,
            newPassword: password,
          });
          setPassword('');
          if (status === 200) {
            setDone(true);
            return { ok: true, detail: '' };
          }
          return { ok: false, detail: problemDetail(payload, 'This link is invalid or expired.') };
        });
      }}
    >
      <Field
        label="New password (8+ characters)"
        name="newPassword"
        type="password"
        value={password}
        onChange={setPassword}
        minLength={8}
        autoComplete="new-password"
      />
      {serverError ? (
        <p role="alert" style={{ color: 'var(--color-error)' }}>
          {serverError}
        </p>
      ) : null}
    </AuthShell>
  );
}
