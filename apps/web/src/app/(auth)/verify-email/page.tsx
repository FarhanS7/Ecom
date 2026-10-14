import { apiBaseUrl } from '@/lib/api';

// Server-side verification: the token never touches client state.
export default async function VerifyEmailPage({ searchParams }: { searchParams: { token?: string } }) {
  const token = searchParams.token;
  if (!token) {
    return (
      <section aria-labelledby="auth-title">
        <h1 id="auth-title">Invalid verification link</h1>
        <p role="alert">This link is missing its token.</p>
      </section>
    );
  }

  let ok = false;
  try {
    const res = await fetch(`${apiBaseUrl()}/v1/auth/verify-email/confirm`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ token }),
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    ok = res.ok;
  } catch {
    ok = false;
  }

  if (!ok) {
    return (
      <section aria-labelledby="auth-title">
        <h1 id="auth-title">Link expired or invalid</h1>
        <p role="alert">This verification link no longer works. Request flow lives with login.</p>
      </section>
    );
  }
  return (
    <section aria-labelledby="auth-title">
      <h1 id="auth-title">Email verified</h1>
      <p role="status">
        Your email is confirmed. <a href="/login">Log in</a>
      </p>
    </section>
  );
}
