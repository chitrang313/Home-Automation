import { useState } from 'react';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../firebase';
import { Link } from 'react-router-dom';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr(''); setMsg(''); setBusy(true);
    try {
      // Firebase sends the reset email itself (uses the project's email template)
      await sendPasswordResetEmail(auth, email);
      setMsg(`Reset link sent to ${email}. Check your inbox.`);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="max-w-md mx-auto px-4 sm:px-5 py-8 sm:py-14">
      <div className="card">
        <h1 className="text-xl sm:text-2xl font-bold mb-1">Reset password</h1>
        <p className="text-ink/60 text-sm mb-5 sm:mb-6">Enter your account email and we'll send a reset link.</p>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="label">Email</label>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          {msg && <div className="text-sm text-success">{msg}</div>}
          {err && <div className="text-sm text-danger">{err}</div>}
          <button disabled={busy} className="btn-primary w-full">{busy ? 'Sending…' : 'Send reset link'}</button>
        </form>

        <div className="mt-5 text-sm text-ink/60">
          Remembered it? <Link to="/login" className="text-ink underline">Back to login</Link>
        </div>
      </div>
    </main>
  );
}
