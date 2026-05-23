import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';

export default function Profile() {
  const { person } = useAuth();
  const [houses, setHouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!person) return;
    let alive = true;
    api
      .listHouses()
      .then((all) => {
        if (!alive) return;
        // For admins listHouses returns ALL houses, so filter to ones in person.houseIds
        const myIds = new Set(Object.keys(person.houseIds || {}));
        setHouses(all.filter((h) => myIds.has(h.id)));
      })
      .catch((e) => alive && setErr(e.message))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [person?.id]);

  if (!person) return null;

  const createdStr = person.createdAt
    ? new Date(person.createdAt).toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

  return (
    <main className="max-w-2xl mx-auto px-4 sm:px-5 py-6 sm:py-10 pb-12">
      <h1 className="text-xl sm:text-2xl font-bold tracking-tight mb-1">My Profile</h1>
      <p className="text-ink/60 text-sm mb-5 sm:mb-6">Your account information and linked houses.</p>

      {err && <div className="text-sm text-danger mb-4">{err}</div>}

      {/* Personal details card */}
      <div className="card mb-4 sm:mb-6">
        <div className="flex items-center gap-3 mb-4 sm:mb-5">
          <div className="h-12 w-12 rounded-full bg-ink text-paper flex items-center justify-center font-bold text-lg shrink-0">
            {(person.name || '?').charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-base sm:text-lg truncate">{person.name || '—'}</div>
            <div className="text-ink/60 text-xs truncate">{person.email}</div>
          </div>
          {person.role === 'admin' && (
            <span className="ml-auto text-[10px] uppercase font-semibold tracking-wide bg-ink text-paper px-2 py-1 rounded shrink-0">
              Admin
            </span>
          )}
        </div>

        <dl className="space-y-3 sm:space-y-4">
          <Field label="Full name" value={person.name} />
          <Field label="Email" value={person.email} mono />
          <Field label="Mobile / Contact" value={person.contact} />
          <Field
            label="Role"
            value={
              <span
                className={
                  'inline-block text-xs uppercase font-semibold tracking-wide px-2 py-0.5 rounded ' +
                  (person.role === 'admin' ? 'bg-ink text-paper' : 'bg-slate2 text-ink/70')
                }
              >
                {person.role || 'user'}
              </span>
            }
          />
          <Field label="Account created" value={createdStr} />
          <Field label="Person ID" value={person.id} mono small />
        </dl>
      </div>

      {/* Linked houses */}
      <div className="card">
        <h2 className="font-semibold mb-3">
          My Houses <span className="text-ink/50 font-normal">({houses.length})</span>
        </h2>
        {loading ? (
          <div className="text-ink/50 text-sm">Loading…</div>
        ) : houses.length === 0 ? (
          <div className="text-ink/50 text-sm">
            You aren't linked to any house yet. An admin needs to add you to one.
          </div>
        ) : (
          <ul className="divide-y divide-slate2">
            {houses.map((h) => (
              <li key={h.id} className="py-3">
                <div className="font-medium">{h.name}</div>
                <div className="text-xs text-ink/60 break-words">{h.location || '—'}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

function Field({ label, value, mono = false, small = false }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4 border-b border-slate2/60 pb-2 last:border-b-0 last:pb-0">
      <dt className="text-xs text-ink/60 uppercase tracking-wide font-medium sm:w-36 shrink-0 sm:pt-0.5">
        {label}
      </dt>
      <dd
        className={
          'text-ink ' +
          (small ? 'text-xs ' : 'text-sm ') +
          (mono ? 'font-mono break-all' : 'break-words')
        }
      >
        {value || <span className="text-ink/40">—</span>}
      </dd>
    </div>
  );
}
