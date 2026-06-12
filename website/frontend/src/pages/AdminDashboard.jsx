import { useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';
import BoardCard from '../components/BoardCard';
import SearchFilter from '../components/SearchFilter';
import ApplianceCard from '../components/ApplianceCard';
import EditApplianceModal from '../components/EditApplianceModal';
import useHouseTree from '../hooks/useHouseTree';
import useMultiHouseTree from '../hooks/useMultiHouseTree';
import {
  APPLIANCE_TYPES,
  SWITCH_TYPES,
} from '../constants/appliances.jsx';

/** Total relay capacity across boards in a room. Each ESP32 exposes 16 GPIOs. */
const PINS_PER_BOARD = 16;
function totalCapacity(boards) {
  return (boards || []).length * PINS_PER_BOARD;
}

/**
 * Admin Dashboard — three tabs:
 *
 *   Houses      → CRUD houses, rooms, boards, appliances; download firmware.
 *   Persons     → CRUD persons; link/unlink to houses.
 *   Find        → cross-house appliance search using the SearchFilter component.
 */
export default function AdminDashboard() {
  const [tab, setTab] = useState('houses');
  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-5 py-6 sm:py-10">
      <h1 className="text-2xl font-bold tracking-tight mb-1">Admin Panel</h1>
      <p className="text-ink/60 text-sm mb-5 sm:mb-6">
        Manage houses, persons, appliances, and ESP32 firmware.
      </p>

      <div className="inline-flex p-1 bg-slate1 rounded-lg mb-5 sm:mb-6">
        {[
          ['houses',  'Houses'],
          ['persons', 'Persons'],
          ['find',    'Find'],
        ].map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={
              'px-3.5 sm:px-4 py-1.5 text-sm font-medium rounded-md transition ' +
              (tab === k ? 'bg-white shadow-sm' : 'text-ink/60 hover:text-ink')
            }
          >{label}</button>
        ))}
      </div>

      {tab === 'houses'  && <HousesTab />}
      {tab === 'persons' && <PersonsTab />}
      {tab === 'find'    && <FindTab />}
    </main>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//   HOUSES TAB — master/detail list
// ═══════════════════════════════════════════════════════════════════════════

function HousesTab() {
  const [houses, setHouses] = useState([]);
  const [persons, setPersons] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

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

  const onAddHouse = async () => {
    const name = prompt('House name');
    if (!name) return;
    const location = prompt('Location (optional)', '') || '';
    try {
      const h = await api.createHouse({ name: name.trim(), location: location.trim() });
      await load();
      setSelectedId(h.id);
    } catch (e) { alert(e.message); }
  };

  const onDeleteHouse = async (id) => {
    if (!confirm('Delete this house and EVERY room / board / appliance inside it?\nThis cannot be undone.')) return;
    try {
      await api.deleteHouse(id);
      if (selectedId === id) setSelectedId(null);
      load();
    } catch (e) { alert(e.message); }
  };

  if (loading) return <Center>Loading…</Center>;

  return (
    <div>
      {err && <div className="text-sm text-danger mb-4">{err}</div>}
      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-5 lg:gap-6">
        {/* ─── List ────────────────────────────────────────────────── */}
        <section className={'card ' + (selectedId ? 'hidden lg:block' : '')}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">
              Houses <span className="text-ink/50 font-normal">({houses.length})</span>
            </h2>
            <button onClick={onAddHouse} className="btn-secondary text-xs py-1 px-2">+ Add</button>
          </div>
          <ul className="divide-y divide-slate2">
            {houses.map((h) => {
              const count = Object.keys(h.contactPersons || {}).length;
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
                  <div className="min-w-0">
                    <div className="font-medium truncate">{h.name}</div>
                    <div className="text-xs text-ink/60 truncate">{h.location || '—'}</div>
                    <div className="text-xs text-ink/50">{count} contact{count === 1 ? '' : 's'}</div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); onDeleteHouse(h.id); }}
                    className="text-xs text-danger hover:underline shrink-0"
                  >Delete</button>
                </li>
              );
            })}
            {houses.length === 0 && <li className="text-ink/50 text-sm py-3">No houses yet.</li>}
          </ul>
        </section>

        {/* ─── Detail ──────────────────────────────────────────────── */}
        <section className={selectedId ? '' : 'hidden lg:block'}>
          {!selectedId ? (
            <div className="card text-ink/50">Select a house to manage it.</div>
          ) : (
            <HouseEditor
              houseId={selectedId}
              persons={persons}
              onBack={() => setSelectedId(null)}
              onChange={load}
            />
          )}
        </section>
      </div>
    </div>
  );
}

function HouseEditor({ houseId, persons, onBack, onChange }) {
  const { tree, loading, error, refresh } = useHouseTree(houseId);
  const [meta, setMeta] = useState({ name: '', location: '' });
  const [savingMeta, setSavingMeta] = useState(false);

  useEffect(() => {
    if (tree?.house) setMeta({ name: tree.house.name || '', location: tree.house.location || '' });
  }, [tree?.house?.id]);

  if (loading || !tree) return <Center>Loading house…</Center>;
  if (error) return <div className="card text-danger text-sm">{error}</div>;

  const onSaveMeta = async () => {
    setSavingMeta(true);
    try { await api.updateHouse(houseId, meta); await refresh(); await onChange?.(); }
    catch (e) { alert(e.message); }
    finally { setSavingMeta(false); }
  };

  const onAddRoom = async () => {
    const name = prompt('Room name (e.g. Hall, Master Bedroom)');
    if (!name) return;
    try { await api.addRoom(houseId, { name: name.trim() }); await refresh(); }
    catch (e) { alert(e.message); }
  };

  const contactIds = Object.keys(tree.house.contactPersons || {});
  const linkedPersons   = persons.filter((p) => contactIds.includes(p.id));
  const unlinkedPersons = persons.filter((p) => !contactIds.includes(p.id));

  return (
    <div className="space-y-5">
      {/* Mobile back button */}
      <button
        onClick={onBack}
        className="lg:hidden text-sm text-ink/60 hover:text-ink flex items-center gap-1"
      >← Back to houses</button>

      {/* Meta */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">House details</h3>
          <button onClick={onSaveMeta} disabled={savingMeta} className="btn-primary">
            {savingMeta ? 'Saving…' : 'Save'}
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Name</label>
            <input className="input" value={meta.name} onChange={(e) => setMeta({ ...meta, name: e.target.value })} />
          </div>
          <div>
            <label className="label">Location</label>
            <input className="input" value={meta.location} onChange={(e) => setMeta({ ...meta, location: e.target.value })} />
          </div>
        </div>
      </div>

      {/* Contact persons */}
      <div className="card">
        <h3 className="font-semibold mb-3">Contact persons</h3>
        {linkedPersons.length === 0 ? (
          <div className="text-ink/50 text-sm mb-3">No contact persons assigned.</div>
        ) : (
          <ul className="divide-y divide-slate2 mb-3">
            {linkedPersons.map((p) => (
              <li key={p.id} className="py-2 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{p.name}</div>
                  <div className="text-xs text-ink/60 truncate">{p.email} · {p.contact}</div>
                </div>
                <button
                  onClick={async () => {
                    if (!confirm(`Remove ${p.name} from this house?`)) return;
                    await api.unlinkPersonFromHouse(houseId, p.id);
                    refresh();
                  }}
                  className="text-xs text-danger hover:underline shrink-0"
                >Remove</button>
              </li>
            ))}
          </ul>
        )}
        <PersonLinker houseId={houseId} unlinked={unlinkedPersons} onChange={refresh} />
      </div>

      {/* Rooms */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Rooms, Boards & Appliances</h3>
          <button onClick={onAddRoom} className="btn-secondary">+ Add Room</button>
        </div>
        {tree.rooms.length === 0 ? (
          <div className="text-ink/50 text-sm">No rooms yet — add one to begin.</div>
        ) : (
          <div className="space-y-5">
            {tree.rooms.map((room) => (
              <RoomEditor
                key={room.id}
                houseId={houseId}
                room={room}
                onChange={refresh}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PersonLinker({ houseId, unlinked, onChange }) {
  const [pid, setPid] = useState('');
  return (
    <div className="flex flex-col sm:flex-row gap-2">
      <select className="input flex-1" value={pid} onChange={(e) => setPid(e.target.value)}>
        <option value="">— select a person to add —</option>
        {unlinked.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.email})</option>)}
      </select>
      <button
        onClick={async () => {
          if (!pid) return;
          await api.linkPersonToHouse(houseId, pid);
          setPid('');
          onChange();
        }}
        disabled={!pid}
        className="btn-primary"
      >Add</button>
    </div>
  );
}

// ─── Room editor (simplified — appliances first, hardware hidden by default) ──
//
// Design intent: admins almost always want to see "what's in this room" first
// and tweak hardware second. So the layout is:
//
//   ┌─ Room header (rename / delete / + Appliance) ──────────────────────┐
//   │  ⚠ Orphan banner (one-click auto-fix)                              │
//   │  Appliance cards grid                                              │
//   │  ▼ Advanced: boards & firmware  ← collapsed by default            │
//   └────────────────────────────────────────────────────────────────────┘
//
// All hardware concepts (board cards, relay slots, firmware downloads,
// "Relay board upgrade required" banner) live inside the Advanced panel.

function RoomEditor({ houseId, room, onChange }) {
  const [showAddAppliance, setShowAddAppliance]   = useState(false);
  const [editingAppliance, setEditingAppliance]   = useState(null);
  const [fixingOrphans,   setFixingOrphans]       = useState(false);

  const totalCount = room.appliances.length;
  const orphans    = useMemo(
    () => room.appliances.filter((a) => !a.boardId || !a.relaySlot),
    [room.appliances]
  );
  const capacity   = totalCapacity(room.boards);
  // Auto-upgrade is detected by the backend (firmwareNeedsUpdate). But for the
  // header summary we also flag the case where the room is over its current
  // total slot capacity, since that always implies a hardware change.
  const overCapacity = totalCount > capacity;

  const onRenameRoom = async () => {
    const name = prompt('Room name', room.name);
    if (!name || name === room.name) return;
    await api.updateRoom(houseId, room.id, { name: name.trim() });
    onChange();
  };
  const onDeleteRoom = async () => {
    if (!confirm(`Delete "${room.name}" and every board / appliance in it?`)) return;
    await api.deleteRoom(houseId, room.id);
    onChange();
  };
  const onFixOrphans = async () => {
    setFixingOrphans(true);
    try {
      const result = await api.autoAssignOrphans(houseId, room.id);
      await onChange();
      if (result.assigned?.length) {
        // Tiny confirmation toast (alert is fine for an admin tool).
        alert(`Assigned ${result.assigned.length} appliance(s) to free slots.`);
      }
    } catch (e) {
      alert('Auto-assign failed: ' + e.message);
    } finally {
      setFixingOrphans(false);
    }
  };

  // For the edit modal — collect every used slot across the room's boards.
  const occupiedSlots = useMemo(() => {
    const m = {};
    for (const a of room.appliances) {
      if (!a.boardId || !a.relaySlot) continue;
      (m[a.boardId] ||= new Set()).add(a.relaySlot);
    }
    return m;
  }, [room.appliances]);

  // Map boardId → deviceId so each ApplianceCard can subscribe to RTDB.
  const deviceIdByBoardId = useMemo(() => {
    const m = {};
    for (const b of room.boards) m[b.id] = b.deviceId;
    return m;
  }, [room.boards]);

  return (
    <div className="rounded-xl border border-slate2 p-3 sm:p-4">
      {/* ── Header ───────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="min-w-0">
          <div className="font-medium truncate">{room.name}</div>
          <div className="text-[11px] text-ink/55 mt-0.5">
            {totalCount} appliance{totalCount === 1 ? '' : 's'}
            {' • '}
            {room.boards.length} board{room.boards.length === 1 ? '' : 's'}
            {capacity > 0 && (
              <> {' • '} {totalCount}/{capacity} slots used </>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-3 text-xs">
          <button onClick={onRenameRoom} className="text-ink/60 hover:text-ink">Rename</button>
          <button onClick={onDeleteRoom} className="text-danger hover:underline">Delete room</button>
          <button onClick={() => setShowAddAppliance(true)} className="text-accent hover:underline font-medium">+ Appliance</button>
        </div>
      </div>

      {/* ── Orphan recovery banner (only when orphans exist) ─────────── */}
      {orphans.length > 0 && (
        <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg p-3 flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-0 text-xs leading-relaxed">
            <strong>{orphans.length} appliance{orphans.length === 1 ? '' : 's'} need a relay slot.</strong>{' '}
            They probably came from a board you deleted earlier. Click below to put them on
            the first free slot{room.boards.length === 0 ? ' (a new board will be created)' : ''}.
          </div>
          <button
            type="button"
            onClick={onFixOrphans}
            disabled={fixingOrphans}
            className="btn-primary text-xs py-1.5 px-3 shrink-0"
          >
            {fixingOrphans ? 'Fixing…' : 'Fix automatically'}
          </button>
        </div>
      )}

      {/* ── Appliance grid ───────────────────────────────────────────── */}
      {totalCount === 0 ? (
        <div className="text-ink/50 text-sm py-6 text-center">
          No appliances in this room yet. Click <span className="font-medium">“+ Appliance”</span> to add one — a board will be created automatically.
        </div>
      ) : (
        <section className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
          {room.appliances.map((a) => {
            const isOrphan = !a.boardId || !a.relaySlot;
            return (
              <div key={a.id} className={isOrphan ? 'ring-1 ring-amber-300/60 rounded-2xl' : ''}>
                <ApplianceCard
                  appliance={a}
                  houseId={houseId}
                  roomId={room.id}
                  deviceId={deviceIdByBoardId[a.boardId]}
                  subtitle={isOrphan ? '⚠ No relay slot — needs a board' : undefined}
                  onEdit={() => setEditingAppliance(a)}
                  onFavoriteChanged={onChange}
                />
              </div>
            );
          })}
        </section>
      )}

      {/* ── Advanced: boards + firmware (collapsed by default) ───────── */}
      <details className="mt-5 group">
        <summary className="cursor-pointer select-none text-xs font-medium text-ink/65 hover:text-ink inline-flex items-center gap-1">
          <span className="transition-transform group-open:rotate-90">▶</span>
          Advanced: boards & firmware
          {overCapacity && (
            <span className="ml-1 text-amber-700">— ⚠ upgrade required</span>
          )}
        </summary>
        <div className="mt-3 pl-4 border-l-2 border-slate2 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-ink/55 leading-relaxed pr-2">
              Each ESP32 controls up to 16 individually-wired relays (one per
              GPIO pin). Pin assignment and firmware download are managed here.
            </p>
            <button
              onClick={async () => { await api.addBoard(houseId, room.id, {}); onChange(); }}
              className="text-xs text-accent hover:underline shrink-0"
            >
              + Add board
            </button>
          </div>

          {overCapacity && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs leading-relaxed">
              ⚠ <strong>Another ESP32 needed.</strong>{' '}
              The room has {totalCount} appliances but only {capacity} GPIO pins across {room.boards.length} ESP32{room.boards.length === 1 ? '' : 's'} (16 each).
              Add another board to wire the rest.
            </div>
          )}

          {room.boards.length === 0 ? (
            <div className="text-ink/50 text-xs">No board yet — adding an appliance creates one automatically.</div>
          ) : (
            room.boards.map((b) => (
              <BoardCard
                key={b.id}
                houseId={houseId}
                roomId={room.id}
                board={b}
                appliances={room.appliances.filter((a) => a.boardId === b.id)}
                onChange={onChange}
                onDelete={onChange}
              />
            ))
          )}
        </div>
      </details>

      {/* ── Modals ───────────────────────────────────────────────────── */}
      <AddApplianceInline
        open={showAddAppliance}
        onClose={() => setShowAddAppliance(false)}
        houseId={houseId}
        roomId={room.id}
        onAdded={() => { setShowAddAppliance(false); onChange(); }}
      />
      <EditApplianceModal
        open={!!editingAppliance}
        onClose={() => setEditingAppliance(null)}
        appliance={editingAppliance}
        boards={room.boards}
        occupiedSlots={occupiedSlots}
        isAdmin
        onSave={async (patch) => {
          await api.updateAppliance(houseId, room.id, editingAppliance.id, patch);
          onChange();
        }}
      />
    </div>
  );
}

function AddApplianceInline({ open, onClose, houseId, roomId, onAdded }) {
  const [name, setName] = useState('');
  const [type, setType] = useState('light');
  const [switchType, setSwitchType] = useState('touch');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (open) {
      setName('');
      setType('light');
      setSwitchType('touch');
      setErr('');
    }
  }, [open]);

  if (!open) return null;
  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) { setErr('Name required'); return; }
    setBusy(true);
    setErr('');
    try {
      await api.addAppliance(houseId, roomId, {
        name: name.trim(),
        type,
        switchType,
      });
      onAdded();
    } catch (e2) { setErr(e2.message); }
    finally { setBusy(false); }
  };

  return (
    <form onSubmit={submit} className="mt-3 grid grid-cols-1 sm:grid-cols-[1fr_140px_180px_auto] gap-2 items-end bg-slate1/50 p-3 rounded-lg">
      <div>
        <label className="label">Appliance name</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ceiling Fan" />
      </div>
      <div>
        <label className="label">Type</label>
        <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
          {APPLIANCE_TYPES.map((t) => <option key={t.id} value={t.id}>{t.emoji}  {t.label}</option>)}
        </select>
      </div>
      <div>
        <label className="label">Switch Type</label>
        <select className="input" value={switchType} onChange={(e) => setSwitchType(e.target.value)}>
          {SWITCH_TYPES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </div>
      <div className="flex gap-2 sm:col-span-1">
        <button type="button" onClick={onClose} className="btn-secondary text-sm">Cancel</button>
        <button type="submit" disabled={busy} className="btn-primary text-sm">{busy ? 'Adding…' : 'Add'}</button>
      </div>
      {err && <div className="sm:col-span-4 text-sm text-danger">{err}</div>}
    </form>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//   PERSONS TAB — list + editor (kept mostly compatible with previous UI)
// ═══════════════════════════════════════════════════════════════════════════

function PersonsTab() {
  const [persons, setPersons] = useState([]);
  const [houses, setHouses] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

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
    const name = prompt('Name'); if (!name) return;
    const email = prompt('Email'); if (!email) return;
    const contact = prompt('Contact (with country code, e.g. +91…)'); if (!contact) return;
    const password = prompt('Initial password (min 6 chars)'); if (!password) return;
    try { await api.createPerson({ name, email, contact, password }); await load(); }
    catch (e) { alert(e.message); }
  };
  const onDeletePerson = async (id) => {
    if (!confirm('Delete person, their auth account, and unlink from all houses?')) return;
    await api.deletePerson(id);
    if (selectedId === id) setSelectedId(null);
    load();
  };
  const selected = persons.find((p) => p.id === selectedId);
  if (loading) return <Center>Loading…</Center>;

  return (
    <div>
      {err && <div className="text-sm text-danger mb-4">{err}</div>}
      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-5 lg:gap-6">
        <section className={'card ' + (selectedId ? 'hidden lg:block' : '')}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Persons <span className="text-ink/50 font-normal">({persons.length})</span></h2>
            <button onClick={onAddPerson} className="btn-secondary text-xs py-1 px-2">+ Add</button>
          </div>
          <ul className="divide-y divide-slate2">
            {persons.map((p) => {
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
                  <div className="min-w-0">
                    <div className="font-medium truncate">
                      {p.name}
                      {p.role === 'admin' && (
                        <span className="ml-2 text-[10px] uppercase font-semibold tracking-wide bg-ink text-paper px-1.5 py-0.5 rounded">Admin</span>
                      )}
                    </div>
                    <div className="text-xs text-ink/60 truncate">{p.email}</div>
                    <div className="text-xs text-ink/50 truncate">{p.contact} · {houseCount} house{houseCount === 1 ? '' : 's'}</div>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); onDeletePerson(p.id); }} className="text-xs text-danger hover:underline shrink-0">Delete</button>
                </li>
              );
            })}
            {persons.length === 0 && <li className="text-ink/50 text-sm py-3">No persons yet.</li>}
          </ul>
        </section>

        <section className={selectedId ? '' : 'hidden lg:block'}>
          {!selected ? (
            <div className="card text-ink/50">Select a person to manage them.</div>
          ) : (
            <PersonEditor
              person={selected}
              houses={houses}
              onBack={() => setSelectedId(null)}
              onChange={load}
            />
          )}
        </section>
      </div>
    </div>
  );
}

function PersonEditor({ person, houses, onBack, onChange }) {
  const [edit, setEdit] = useState({ name: person.name, email: person.email, contact: person.contact });
  const [saving, setSaving] = useState(false);
  useEffect(() => setEdit({ name: person.name, email: person.email, contact: person.contact }), [person.id]);

  const onSave = async () => {
    setSaving(true);
    try { await api.updatePerson(person.id, edit); await onChange(); }
    catch (e) { alert(e.message); }
    finally { setSaving(false); }
  };

  const linkedIds = Object.keys(person.houseIds || {});
  const linkedHouses   = houses.filter((h) => linkedIds.includes(h.id));
  const unlinkedHouses = houses.filter((h) => !linkedIds.includes(h.id));

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="lg:hidden text-sm text-ink/60 hover:text-ink">← Back</button>
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Person details</h3>
          <button onClick={onSave} disabled={saving} className="btn-primary">{saving ? 'Saving…' : 'Save'}</button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className="label">Name</label><input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></div>
          <div><label className="label">Contact</label><input className="input" value={edit.contact} onChange={(e) => setEdit({ ...edit, contact: e.target.value })} /></div>
          <div className="sm:col-span-2"><label className="label">Email</label><input className="input" type="email" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></div>
        </div>
      </div>
      <div className="card">
        <h3 className="font-semibold mb-3">Houses this person can access</h3>
        {linkedHouses.length === 0 ? (
          <div className="text-ink/50 text-sm mb-3">Not linked to any house.</div>
        ) : (
          <ul className="divide-y divide-slate2 mb-3">
            {linkedHouses.map((h) => (
              <li key={h.id} className="py-2 flex items-center justify-between">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{h.name}</div>
                  <div className="text-xs text-ink/60 truncate">{h.location || '—'}</div>
                </div>
                <button
                  onClick={async () => {
                    if (!confirm(`Remove ${person.name} from ${h.name}?`)) return;
                    await api.unlinkPersonFromHouse(h.id, person.id);
                    onChange();
                  }}
                  className="text-xs text-danger hover:underline shrink-0"
                >Unlink</button>
              </li>
            ))}
          </ul>
        )}
        <HouseLinker person={person} unlinked={unlinkedHouses} onChange={onChange} />
      </div>
    </div>
  );
}

function HouseLinker({ person, unlinked, onChange }) {
  const [hid, setHid] = useState('');
  return (
    <div className="flex flex-col sm:flex-row gap-2">
      <select className="input flex-1" value={hid} onChange={(e) => setHid(e.target.value)}>
        <option value="">— link this person to a house —</option>
        {unlinked.map((h) => <option key={h.id} value={h.id}>{h.name}{h.location ? ` (${h.location})` : ''}</option>)}
      </select>
      <button
        onClick={async () => { if (!hid) return; await api.linkPersonToHouse(hid, person.id); setHid(''); onChange(); }}
        disabled={!hid}
        className="btn-primary"
      >Link</button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//   FIND TAB — cross-house appliance search
// ═══════════════════════════════════════════════════════════════════════════

function FindTab() {
  const [houseIds, setHouseIds] = useState(null);

  useEffect(() => {
    (async () => {
      const houses = await api.listHouses();
      setHouseIds(houses.map((h) => h.id));
    })().catch(console.error);
  }, []);

  if (!houseIds) return <Center>Loading…</Center>;
  if (houseIds.length === 0) return <div className="card text-ink/50">No houses yet.</div>;

  return <FindBody houseIds={houseIds} />;
}

function FindBody({ houseIds }) {
  // Reuse the user-side multi-tree hook to gather everything across houses.
  const { trees, appliances, rooms, loading, refresh } = useMultiHouseTree(houseIds);
  const [filter, setFilter] = useState({ houseId: '', roomId: '', type: '' });
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [editing, setEditing] = useState(null);

  const filtered = useMemo(() => {
    return appliances.filter((a) => {
      if (filter.houseId && a.houseId !== filter.houseId) return false;
      if (filter.roomId  && a.roomId  !== filter.roomId)  return false;
      if (filter.type    && a.type    !== filter.type)    return false;
      if (favoritesOnly  && !a.favorite)                  return false;
      return true;
    });
  }, [appliances, filter, favoritesOnly]);

  const favoritesCount = appliances.filter((a) => a.favorite).length;

  const openEdit = (a) => {
    const tree = trees.find((t) => t.house.id === a.houseId);
    const room = tree?.rooms.find((r) => r.id === a.roomId);
    if (!room) return;
    const occupied = {};
    for (const ap of room.appliances) {
      if (!ap.relaySlot) continue;
      (occupied[ap.boardId] ||= new Set()).add(ap.relaySlot);
    }
    setEditing({ houseId: a.houseId, roomId: a.roomId, appliance: a, boards: room.boards, occupiedSlots: occupied });
  };

  return (
    <>
      <SearchFilter
        houses={trees.map((t) => ({ id: t.house.id, name: t.house.name }))}
        rooms={rooms}
        value={filter}
        onChange={setFilter}
        resultCount={filtered.length}
        totalCount={appliances.length}
      />
      <div className="-mt-2 mb-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setFavoritesOnly((v) => !v)}
          disabled={favoritesCount === 0 && !favoritesOnly}
          aria-pressed={favoritesOnly}
          className={
            'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition ' +
            (favoritesOnly
              ? 'bg-amber-400/15 text-amber-700 ring-1 ring-amber-400/40'
              : 'bg-slate1 text-ink/70 hover:bg-slate2') +
            ' disabled:opacity-50 disabled:cursor-not-allowed'
          }
        >
          <svg viewBox="0 0 24 24" fill={favoritesOnly ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" className="w-4 h-4">
            <path d="M12 3.5l2.65 5.37 5.93.86-4.29 4.18 1.01 5.9L12 17l-5.3 2.81 1.01-5.9L3.42 9.73l5.93-.86L12 3.5z" />
          </svg>
          Favourites only
          {favoritesCount > 0 && (
            <span className={
              'inline-flex items-center justify-center min-w-5 h-5 px-1.5 text-[11px] rounded-full ' +
              (favoritesOnly ? 'bg-amber-500 text-white' : 'bg-slate2 text-ink/70')
            }>{favoritesCount}</span>
          )}
        </button>
      </div>
      {loading && <div className="text-ink/60 text-sm">Loading…</div>}
      {filtered.length === 0 ? (
        <div className="card text-center py-10 text-ink/50">No appliances match the current filter.</div>
      ) : (
        <section className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
          {filtered.map((a) => (
            <ApplianceCard
              key={`${a.houseId}-${a.roomId}-${a.id}`}
              appliance={a}
              houseId={a.houseId}
              roomId={a.roomId}
              deviceId={a.deviceId}
              subtitle={`${a.houseName} › ${a.roomName}`}
              onEdit={() => openEdit(a)}
              onFavoriteChanged={refresh}
            />
          ))}
        </section>
      )}
      <EditApplianceModal
        open={!!editing}
        onClose={() => setEditing(null)}
        appliance={editing?.appliance}
        boards={editing?.boards}
        occupiedSlots={editing?.occupiedSlots}
        isAdmin
        onSave={async (patch) => {
          await api.updateAppliance(editing.houseId, editing.roomId, editing.appliance.id, patch);
          await refresh();
        }}
      />
    </>
  );
}

function Center({ children }) {
  return <div className="min-h-[40vh] flex items-center justify-center text-ink/60">{children}</div>;
}
