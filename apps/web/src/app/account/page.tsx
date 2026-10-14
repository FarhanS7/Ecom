import { SessionPanel } from '@/features/auth/session-panel';
import { currentSessionEmail } from '@/lib/session-server';

export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const email = await currentSessionEmail();
  return (
    <section aria-labelledby="account-title">
      <h1 id="account-title">Your account</h1>
      <SessionPanel initialEmail={email} />
    </section>
  );
}
