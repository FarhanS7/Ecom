'use client';

import { useState } from 'react';
import { RegisterForm } from '@/features/auth/auth-flows';

export default function RegisterPage() {
  const [doneEmail, setDoneEmail] = useState<string | null>(null);

  if (doneEmail) {
    return (
      <section aria-labelledby="auth-title">
        <h1 id="auth-title">Account created</h1>
        <p role="status">
          Welcome, {doneEmail}. <a href="/account">Go to your account</a>
        </p>
      </section>
    );
  }

  return <RegisterForm onDone={setDoneEmail} />;
}
