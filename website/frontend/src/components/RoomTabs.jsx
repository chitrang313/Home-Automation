/**
 * Horizontal-scroll room tab bar.
 * Props: rooms = [{id, name}], activeId, onSelect(id)
 */
export default function RoomTabs({ rooms, activeId, onSelect }) {
  if (!rooms?.length) {
    return (
      <div className="on-bg-muted text-sm py-3 px-1">No rooms yet — ask admin to add one.</div>
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
                'whitespace-nowrap px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ' +
                (isActive
                  ? 'bg-ink text-paper shadow-[0_6px_18px_rgba(0,0,0,0.4)]'
                  : 'glass text-ink/80 hover:text-ink')
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
