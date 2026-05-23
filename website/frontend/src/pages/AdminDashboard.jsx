import { useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';

// ─── Shared search + sort UI ──────────────────────────────────────────────────
function SearchSort({ search, onSearchChange, sortBy, onSortChange, placeholder }) {
  return (
    <div className="flex flex-col sm:flex-row gap-2 mb-3">
      <div className="relative flex-1">
        <input
          type="search"
          className="input pl-9"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={placeholder}
          aria-label="Search"
        />
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink/40 pointer-events-none"
        >
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </div>
      <select
        className="input sm:w-48"
        value={sortBy}
        onChange={(e) => onSortChange(e.target.value)}
        aria-label="Sort"
      >
        <option value="name-asc">Name (A → Z)</option>
        <option value="name-desc">Name (Z → A)</option>
        <option value="date-desc">Newest first</option>
        <option value="date-asc">Oldest first</option>
      </select>
    </div>
  );
}

/** Sort an array of {name, createdAt} objects by sortBy = "<field>-<dir>" */
function sortList(arr, sortBy) {
  const [field, dir] = sortBy.split('-');
  const mul = dir === 'asc' ? 1 : -1;
  return arr.sort((a, b) => {
    if (field === 'name') {
      return ((a.name || '').toLowerCase() < (b.name || '').toLowerCase() ? -1 : 1) * mul;
    }
    return ((a.createdAt || 0) - (b.createdAt || 0)) * mul;
  });
}

export default function AdminDashboard() {
  const [tab, setTab] = useState('houses');
  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-5 py-6 sm:py-10 pb-12">
      <h1 className="text-xl sm:text-2xl font-bold tracking-tight mb-1">Admin Panel</h1>
      <p className="text-ink/60 text-sm mb-4 sm:mb-6">Manage houses, persons, and their links.</p>

      <div className="inline-flex p-1 bg-slate1 rounded-lg mb-5 sm:mb-6">
        {[
          ['houses', 'Houses'],
          ['persons', 'Persons'],
        ].map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={
              'px-4 py-2 text-sm font-medium rounded-md transition min-h-[36px] ' +
              (tab === k ? 'bg-white shadow-sm' : 'text-ink/60 hover:text-ink')
            }
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'houses' ? <HousesTab /> : <PersonsTab />}
    </main>
  );
}

// ─── HOUSES TAB ────────────────────────────────────────────────────────────────

function HousesTab() {
  const [houses, setHouses] = useState([]);
  const [persons, setPersons] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [house, setHouse] = useState(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('name-asc');

  const load = async () => {
    setErr('');
    try {
      const [h, p] = await Promise.all([api.listHouses(), api.listPersons()]);
      setHouses(h);
      setPersons(p);
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!selectedId) { setHouse(null); return; }
    api.getHouse(selectedId).then(setHouse).catch((e) => setErr(e.message));
  }, [selectedId]);

  const refreshSelected = async () => {
    if (selectedId) setHouse(await api.getHouse(selectedId));
  };

  const onAddHouse = async () => {
    const name = prompt('House name (e.g. Ganesh Krupa)');
    if (!name) return;
    const location = prompt('Location (flat / floor / building / city)', '') || '';
    const h = await api.createHouse({ name, location });
    await load();
    setSelectedId(h.id);
  };

  const onDeleteHouse = async (id) => {
    if (!confirm('Delete house and all its rooms/appliances?')) return;
    await api.deleteHouse(id);
    if (selectedId === id) setSelectedId(null);
    load();
  };

  // Filter + sort
  const visibleHouses = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = q
      ? houses.filter(h =>
          (h.name || '').toLowerCase().includes(q) ||
          (h.location || '').toLowerCase().includes(q)
        )
      : houses.slice();
    return sortList(list, sortBy);
  }, [houses, search, sortBy]);

  if (loading) return <Center>Loading…</Center>;

  return (
    <div>
      {err && <div className="text-sm text-danger mb-4">{err}</div>}
      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4 sm:gap-6">
        {/* On mobile, when something is selected, hide the list so the editor takes the whole screen */}
        <section className={'card ' + (house ? 'hidden lg:block' : '')}>
          <div className="flex items-center justify-between mb-3 gap-2">
            <h2 className="font-semibold">
              Houses <span className="text-ink/50 font-normal">
                ({visibleHouses.length}{visibleHouses.length !== houses.length ? `/${houses.length}` : ''})
              </span>
            </h2>
            <button onClick={onAddHouse} className="btn-sm bg-ink text-paper hover:bg-ink/90 shrink-0">
              + Add
            </button>
          </div>

          {/* Search + sort */}
          <SearchSort
            search={search}
            onSearchChange={setSearch}
            sortBy={sortBy}
            onSortChange={setSortBy}
            placeholder="Search by name or location…"
          />

          <ul className="divide-y divide-slate2">
            {visibleHouses.map((h) => {
              const personCount = Object.keys(h.contactPersons || {}).length;
              const isSel = h.id === selectedId;
              return (
                <li
                  key={h.id}
                  onClick={() => setSelectedId(h.id)}
                  className={
                    'py-3 px-2 -mx-2 rounded-md cursor-pointer transition flex items-start justify-between gap-3 ' +
                    (isSel ? 'bg-slate1' : 'hover:bg-slate1/60')
                  }
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{h.name}</div>
                    <div className="text-xs text-ink/60 truncate">{h.location || '—'}</div>
                    <div className="text-xs text-ink/50">
                      {personCount} contact{personCount === 1 ? '' : 's'}
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); onDeleteHouse(h.id); }}
                    className="text-xs text-danger hover:underline shrink-0 px-2 py-1"
                  >
                    Delete
                  </button>
                </li>
              );
            })}
            {visibleHouses.length === 0 && (
              <li className="text-ink/50 text-sm py-3">
                {houses.length === 0 ? 'No houses yet.' : 'No houses match your search.'}
              </li>
            )}
          </ul>
        </section>

        <section className={house ? '' : 'hidden lg:block'}>
          {!house ? (
            <div className="card text-ink/50">Select a house to manage it.</div>
          ) : (
            <HouseEditor
              house={house}
              persons={persons}
              refresh={refreshSelected}
              refreshHouses={load}
              onBack={() => setSelectedId(null)}
            />
          )}
        </section>
      </div>
    </div>
  );
}

function HouseEditor({ house, persons, refresh, refreshHouses, onBack }) {
  const [savingMeta, setSavingMeta] = useState(false);
  const [meta, setMeta] = useState({ name: house.name || '', location: house.location || '' });
  useEffect(() => setMeta({ name: house.name || '', location: house.location || '' }), [house.id]);

  const onSaveMeta = async () => {
    setSavingMeta(true);
    try { await api.updateHouse(house.id, meta); await refresh(); await refreshHouses(); }
    finally { setSavingMeta(false); }
  };

  const onAddRoom = async () => {
    const name = prompt('Room name (e.g. Hall, Master Bedroom)');
    if (!name) return;
    await api.addRoom(house.id, { name, order: Object.keys(house.rooms || {}).length });
    refresh();
  };

  const rooms = house.rooms
    ? Object.entries(house.rooms).map(([id, r]) => ({ id, ...r })).sort((a,b)=>(a.order||0)-(b.order||0))
    : [];

  const contactIds = Object.keys(house.contactPersons || {});
  const linkedPersons = persons.filter(p => contactIds.includes(p.id));
  const unlinkedPersons = persons.filter(p => !contactIds.includes(p.id));

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Mobile-only back button */}
      <button
        onClick={onBack}
        className="lg:hidden inline-flex items-center gap-1 text-sm text-ink/60 hover:text-ink"
      >
        <span>←</span> <span>Back to houses</span>
      </button>

      <div className="card">
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <h3 className="font-semibold">House details</h3>
          <button onClick={onSaveMeta} disabled={savingMeta} className="btn-sm bg-ink text-paper hover:bg-ink/90 disabled:opacity-50">
            {savingMeta ? 'Saving…' : 'Save'}
          </button>
        </div>
        <div className="grid grid-cols-1 gap-3">
          <div>
            <label className="label">Name</label>
            <input className="input" value={meta.name} onChange={(e)=>setMeta({...meta, name:e.target.value})} />
          </div>
          <div>
            <label className="label">Location</label>
            <input className="input" value={meta.location} onChange={(e)=>setMeta({...meta, location:e.target.value})} />
          </div>
        </div>
      </div>

      <div className="card">
        <h3 className="font-semibold mb-3">Contact persons</h3>
        {linkedPersons.length === 0 ? (
          <div className="text-ink/50 text-sm mb-3">No contact persons assigned.</div>
        ) : (
          <ul className="divide-y divide-slate2 mb-3">
            {linkedPersons.map((p) => (
              <li key={p.id} className="py-2 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{p.name}</div>
                  <div className="text-xs text-ink/60 truncate">{p.email}</div>
                  <div className="text-xs text-ink/60 truncate">{p.contact}</div>
                </div>
                <button
                  onClick={async () => {
                    if (!confirm(`Remove ${p.name} from this house?`)) return;
                    await api.unlinkPersonFromHouse(house.id, p.id);
                    refresh();
                  }}
                  className="text-xs text-danger hover:underline shrink-0 px-2 py-1"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        <AddPersonToHouse house={house} unlinked={unlinkedPersons} refresh={refresh} />
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <h3 className="font-semibold">Rooms &amp; Appliances</h3>
          <button onClick={onAddRoom} className="btn-sm bg-slate1 text-ink hover:bg-slate2 border border-slate3 shrink-0">
            + Add room
          </button>
        </div>
        {rooms.length === 0
          ? <div className="text-ink/50 text-sm">No rooms yet.</div>
          : <div className="space-y-3 sm:space-y-4">
              {rooms.map((room) => <RoomEditor key={room.id} houseId={house.id} room={room} refresh={refresh} />)}
            </div>}
      </div>
    </div>
  );
}

function AddPersonToHouse({ house, unlinked, refresh }) {
  const [pid, setPid] = useState('');
  const add = async () => {
    if (!pid) return;
    await api.linkPersonToHouse(house.id, pid);
    setPid('');
    refresh();
  };
  return (
    <div className="flex flex-col sm:flex-row gap-2">
      <select className="input flex-1" value={pid} onChange={(e)=>setPid(e.target.value)}>
        <option value="">— select a person to add —</option>
        {unlinked.map(p => <option key={p.id} value={p.id}>{p.name} ({p.email})</option>)}
      </select>
      <button onClick={add} disabled={!pid} className="btn-primary sm:w-auto">Add</button>
    </div>
  );
}

function RoomEditor({ houseId, room, refresh }) {
  const appliances = room.appliances
    ? Object.entries(room.appliances).map(([id, a]) => ({ id, ...a }))
    : [];

  const onRename = async () => {
    const name = prompt('New room name', room.name);
    if (!name || name === room.name) return;
    await api.updateRoom(houseId, room.id, { name });
    refresh();
  };
  const onDelete = async () => {
    if (!confirm(`Delete room "${room.name}"?`)) return;
    await api.deleteRoom(houseId, room.id);
    refresh();
  };
  const onAddAppliance = async () => {
    const name = prompt('Appliance name (e.g. Ceiling Light)');
    if (!name) return;
    const icon = prompt('Icon (bulb / fan / tv / plug / ac)', 'bulb') || 'bulb';
    await api.addAppliance(houseId, room.id, { name, icon });
    refresh();
  };

  return (
    <div className="rounded-lg border border-slate2 p-3 sm:p-4">
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <div className="font-medium">{room.name}</div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
          <button onClick={onRename} className="text-ink/60 hover:text-ink py-1">Rename</button>
          <button onClick={onDelete} className="text-danger hover:underline py-1">Delete</button>
          <button onClick={onAddAppliance} className="text-accent hover:underline py-1">+ Appliance</button>
        </div>
      </div>
      {appliances.length === 0 ? (
        <div className="text-ink/50 text-xs">No appliances.</div>
      ) : (
        <ul className="divide-y divide-slate2">
          {appliances.map((a) => (
            <li key={a.id} className="py-2 flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{a.name}</div>
                <div className="text-[10px] sm:text-xs text-ink/50 font-mono truncate">{a.icon} · {a.relayPath}</div>
              </div>
              <div className="flex gap-2 text-xs shrink-0">
                <button
                  onClick={async () => {
                    const name = prompt('Name', a.name);
                    const relayPath = prompt('Relay path', a.relayPath);
                    const icon = prompt('Icon', a.icon);
                    if (!name || !relayPath) return;
                    await api.updateAppliance(houseId, room.id, a.id, { name, relayPath, icon });
                    refresh();
                  }}
                  className="text-ink/60 hover:text-ink py-1 px-2"
                >Edit</button>
                <button
                  onClick={async () => {
                    if (!confirm(`Delete "${a.name}"?`)) return;
                    await api.deleteAppliance(houseId, room.id, a.id);
                    refresh();
                  }}
                  className="text-danger hover:underline py-1 px-2"
                >Delete</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── PERSONS TAB ───────────────────────────────────────────────────────────────

function PersonsTab() {
  const [persons, setPersons] = useState([]);
  const [houses, setHouses] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('name-asc');

  const load = async () => {
    setErr('');
    try {
      const [p, h] = await Promise.all([api.listPersons(), api.listHouses()]);
      setPersons(p);
      setHouses(h);
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const onAddPerson = async () => {
    const name = prompt('Name');           if (!name) return;
    const email = prompt('Email');         if (!email) return;
    const contact = prompt('Contact number'); if (!contact) return;
    const password = prompt('Initial password (min 6 chars)'); if (!password) return;
    try {
      await api.createPerson({ name, email, contact, password });
      await load();
    } catch (e) { alert(e.message); }
  };

  const onDeletePerson = async (id) => {
    if (!confirm('Delete this person, their auth account, and all house links?')) return;
    await api.deletePerson(id);
    if (selectedId === id) setSelectedId(null);
    load();
  };

  const selected = persons.find(p => p.id === selectedId);

  // Filter by name / email / contact, then sort
  const visiblePersons = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = q
      ? persons.filter(p =>
          (p.name || '').toLowerCase().includes(q) ||
          (p.email || '').toLowerCase().includes(q) ||
          (p.contact || '').toLowerCase().includes(q)
        )
      : persons.slice();
    return sortList(list, sortBy);
  }, [persons, search, sortBy]);

  if (loading) return <Center>Loading…</Center>;

  return (
    <div>
      {err && <div className="text-sm text-danger mb-4">{err}</div>}
      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4 sm:gap-6">
        <section className={'card ' + (selected ? 'hidden lg:block' : '')}>
          <div className="flex items-center justify-between mb-3 gap-2">
            <h2 className="font-semibold">
              Persons <span className="text-ink/50 font-normal">
                ({visiblePersons.length}{visiblePersons.length !== persons.length ? `/${persons.length}` : ''})
              </span>
            </h2>
            <button onClick={onAddPerson} className="btn-sm bg-ink text-paper hover:bg-ink/90 shrink-0">
              + Add
            </button>
          </div>

          {/* Search + sort */}
          <SearchSort
            search={search}
            onSearchChange={setSearch}
            sortBy={sortBy}
            onSortChange={setSortBy}
            placeholder="Search by name, email or mobile…"
          />

          <ul className="divide-y divide-slate2">
            {visiblePersons.map((p) => {
              const houseCount = Object.keys(p.houseIds || {}).length;
              const isSel = p.id === selectedId;
              return (
                <li
                  key={p.id}
                  onClick={() => setSelectedId(p.id)}
                  className={
                    'py-3 px-2 -mx-2 rounded-md cursor-pointer transition flex items-start justify-between gap-3 ' +
                    (isSel ? 'bg-slate1' : 'hover:bg-slate1/60')
                  }
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">
                      {p.name}
                      {p.role === 'admin' && (
                        <span className="ml-2 text-[10px] uppercase font-semibold tracking-wide bg-ink text-paper px-1.5 py-0.5 rounded">
                          Admin
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-ink/60 truncate">{p.email}</div>
                    <div className="text-xs text-ink/50 truncate">
                      {p.contact} · {houseCount} house{houseCount === 1 ? '' : 's'}
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); onDeletePerson(p.id); }}
                    className="text-xs text-danger hover:underline shrink-0 px-2 py-1"
                  >
                    Delete
                  </button>
                </li>
              );
            })}
            {visiblePersons.length === 0 && (
              <li className="text-ink/50 text-sm py-3">
                {persons.length === 0 ? 'No persons yet.' : 'No persons match your search.'}
              </li>
            )}
          </ul>
        </section>

        <section className={selected ? '' : 'hidden lg:block'}>
          {!selected ? (
            <div className="card text-ink/50">Select a person to manage them.</div>
          ) : (
            <PersonEditor
              person={selected}
              houses={houses}
              refresh={load}
              onBack={() => setSelectedId(null)}
            />
          )}
        </section>
      </div>
    </div>
  );
}

function PersonEditor({ person, houses, refresh, onBack }) {
  const [edit, setEdit] = useState({ name: person.name, email: person.email, contact: person.contact });
  useEffect(() => setEdit({ name: person.name, email: person.email, contact: person.contact }), [person.id]);
  const [saving, setSaving] = useState(false);

  const onSave = async () => {
    setSaving(true);
    try { await api.updatePerson(person.id, edit); await refresh(); }
    catch (e) { alert(e.message); }
    finally { setSaving(false); }
  };

  const linkedIds = Object.keys(person.houseIds || {});
  const linkedHouses = houses.filter(h => linkedIds.includes(h.id));
  const unlinkedHouses = houses.filter(h => !linkedIds.includes(h.id));

  return (
    <div className="space-y-4 sm:space-y-6">
      <button
        onClick={onBack}
        className="lg:hidden inline-flex items-center gap-1 text-sm text-ink/60 hover:text-ink"
      >
        <span>←</span> <span>Back to persons</span>
      </button>

      <div className="card">
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <h3 className="font-semibold">Person details</h3>
          <button onClick={onSave} disabled={saving} className="btn-sm bg-ink text-paper hover:bg-ink/90 disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Name</label>
            <input className="input" value={edit.name} onChange={(e)=>setEdit({...edit, name:e.target.value})} />
          </div>
          <div>
            <label className="label">Contact</label>
            <input className="input" type="tel" value={edit.contact} onChange={(e)=>setEdit({...edit, contact:e.target.value})} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Email</label>
            <input className="input" type="email" value={edit.email} onChange={(e)=>setEdit({...edit, email:e.target.value})} />
          </div>
        </div>
      </div>

      <div className="card">
        <h3 className="font-semibold mb-3">Houses this person can access</h3>
        {linkedHouses.length === 0 ? (
          <div className="text-ink/50 text-sm mb-3">Not linked to any house.</div>
        ) : (
          <ul className="divide-y divide-slate2 mb-3">
            {linkedHouses.map((h) => (
              <li key={h.id} className="py-2 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{h.name}</div>
                  <div className="text-xs text-ink/60 truncate">{h.location || '—'}</div>
                </div>
                <button
                  onClick={async () => {
                    if (!confirm(`Remove ${person.name} from ${h.name}?`)) return;
                    await api.unlinkPersonFromHouse(h.id, person.id);
                    refresh();
                  }}
                  className="text-xs text-danger hover:underline shrink-0 px-2 py-1"
                >
                  Unlink
                </button>
              </li>
            ))}
          </ul>
        )}
        <AddHouseToPerson person={person} unlinked={unlinkedHouses} refresh={refresh} />
      </div>
    </div>
  );
}

function AddHouseToPerson({ person, unlinked, refresh }) {
  const [hid, setHid] = useState('');
  const add = async () => {
    if (!hid) return;
    await api.linkPersonToHouse(hid, person.id);
    setHid('');
    refresh();
  };
  return (
    <div className="flex flex-col sm:flex-row gap-2">
      <select className="input flex-1" value={hid} onChange={(e)=>setHid(e.target.value)}>
        <option value="">— link this person to a house —</option>
        {unlinked.map(h => <option key={h.id} value={h.id}>{h.name}{h.location ? ` (${h.location})` : ''}</option>)}
      </select>
      <button onClick={add} disabled={!hid} className="btn-primary sm:w-auto">Link</button>
    </div>
  );
}

function Center({ children }) {
  return <div className="min-h-[40vh] flex items-center justify-center text-ink/60">{children}</div>;
}
