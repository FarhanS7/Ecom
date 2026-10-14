import { ResetConfirmForm } from '@/features/auth/auth-flows';

export default function ResetPasswordPage({ searchParams }: { searchParams: { token?: string } }) {
  const token = searchParams.token;
  if (!token) {
    return (
      <section aria-labelledby="auth-title">
        <h1 id="auth-title">Invalid reset link</h1>
        <p role="alert">
          This link is missing its token. <a href="/forgot-password">Request a new one</a>.
        </p>
      </section>
    );
  }
  return <ResetConfirmForm token={token} />;
}
