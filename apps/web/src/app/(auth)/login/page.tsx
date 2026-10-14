'use client';

// No redirects anywhere in auth UI by design (loop-freedom is structural):
// success states render links instead of navigating.

import { useState } from 'react';
import { LoginForm } from '@/features/auth/auth-flows';

export default function LoginPage() {
  const [doneEmail, setDoneEmail] = useState<string | null>(null);

  if (doneEmail) {
    return (
      <section aria-labelledby="auth-title">
        <h1 id="auth-title">Welcome back</h1>
        <p role="status">
          Logged in as {doneEmail}. <a href="/account">Go to your account</a>
        </p>
      </section>
    );
  }

  return <LoginForm onDone={setDoneEmail} />;
}
