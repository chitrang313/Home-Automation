import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

export default function Signup() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '', email: '', contact: '', password: '',
    houseName: '', location: '',
  });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      await api.signup({
        email: form.email,
        password: form.password,
        name: form.name,
        contact: form.contact,
        house: { name: form.houseName, location: form.location },
      });
      await login(form.email, form.password);
      navigate('/dashboard');
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="max-w-xl mx-auto px-5 py-14">
      <div className="card">
        <h1 className="text-2xl font-bold mb-1">Create your account</h1>
        <p className="text-ink/60 text-sm mb-6">Register yourself and your first house.</p>

        <form onSubmit={onSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <h2 className="text-sm font-semibold text-ink/70 mb-1">You</h2>
          </div>
          <div>
            <label className="label">Name</label>
            <input className="input" value={form.name} onChange={set('name')} required />
          </div>
          <div>
            <label className="label">Contact number</label>
            <input className="input" type="tel" placeholder="9876543210" value={form.contact} onChange={set('contact')} required />
          </div>
          <div>
            <label className="label">Email</label>
            <input className="input" type="email" value={form.email} onChange={set('email')} required />
          </div>
          <div>
            <label className="label">Password</label>
            <input className="input" type="password" minLength={6} value={form.password} onChange={set('password')} required />
          </div>

          <div className="sm:col-span-2 mt-2">
            <h2 className="text-sm font-semibold text-ink/70 mb-1">Your house</h2>
          </div>
          <div className="sm:col-span-2">
            <label className="label">House name</label>
            <input className="input" placeholder="Ganesh Krupa" value={form.houseName} onChange={set('houseName')} required />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Location</label>
            <input className="input" placeholder="B805, 8th floor, Bharat Nagar, Mumbai" value={form.location} onChange={set('location')} />
          </div>

          {err && <div className="sm:col-span-2 text-sm text-danger">{err}</div>}

          <div className="sm:col-span-2">
            <button disabled={busy} className="btn-primary w-full">{busy ? 'Creating…' : 'Create account'}</button>
          </div>
        </form>

        <div className="mt-5 text-sm text-ink/60">
          Already have an account? <Link to="/login" className="text-ink underline">Sign in</Link>
        </div>
      </div>
    </main>
  );
}
