/**
 * Horizontal-scroll room tab bar.
 * Props: rooms = [{id, name}], activeId, onSelect(id)
 */
export default function RoomTabs({ rooms, activeId, onSelect }) {
  if (!rooms?.length) {
    return (
      <div className="text-ink/50 text-sm py-3 px-1">No rooms yet — ask admin to add one.</div>
    );
  }
  return (
    <div className="no-scrollbar overflow-x-auto -mx-5 px-5">
      <div className="inline-flex gap-2 py-1">
        {rooms.map((r) => {
          const isActive = r.id === activeId;
          return (
            <button
              key={r.id}
              onClick={() => onSelect(r.id)}
              className={
                'whitespace-nowrap px-4 py-2 rounded-full text-sm font-medium transition ' +
                (isActive
                  ? 'bg-ink text-paper'
                  : 'bg-slate1 text-ink/70 hover:bg-slate2')
              }
            >
              {r.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
