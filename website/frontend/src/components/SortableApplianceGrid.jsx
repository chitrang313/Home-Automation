import { useEffect, useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import ApplianceCard from './ApplianceCard';
import { api } from '../services/api';

/**
 * Drag-to-reorder grid of ApplianceCards for a single room.
 *
 * On drop we (1) optimistically reorder the local list, (2) PATCH each
 * appliance with its new sortIndex via api.reorderAppliances, and
 * (3) ask the parent to refresh. Failure rolls the order back.
 *
 * Drag is initiated from the small handle on the left of each card so
 * tapping the toggle / star / edit buttons still works as a regular click.
 *
 * Props:
 *   houseId, roomId      Required.
 *   appliances           Appliances already in display order (sorted by the hook).
 *   boards               Same room's boards — used to look up deviceId per card.
 *   isAdmin              When true, edit pencil opens parent's modal.
 *   onEdit(appliance)    Opens the edit modal in the parent.
 *   onChange()           Parent refreshes the tree.
 *   disabled             Hide drag handles + skip persistence (e.g. while filtered).
 */
export default function SortableApplianceGrid({
  houseId,
  roomId,
  appliances,
  boards,
  isAdmin = false,
  onEdit,
  onChange,
  disabled = false,
}) {
  // Local mirror so the drop animation finishes BEFORE the parent re-fetch
  // re-orders the DOM. Kept in sync whenever the source list changes.
  const [items, setItems] = useState(appliances);
  useEffect(() => { setItems(appliances); }, [appliances]);

  const sensors = useSensors(
    // pointer requires a small drag distance so accidental taps don't trigger
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const boardsById = Object.fromEntries((boards || []).map((b) => [b.id, b]));

  const onDragEnd = async (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = items.findIndex((a) => a.id === active.id);
    const newIndex = items.findIndex((a) => a.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const next = arrayMove(items, oldIndex, newIndex);
    setItems(next);                              // optimistic

    try {
      await api.reorderAppliances(houseId, roomId, next.map((a) => a.id));
      await onChange?.();
    } catch (err) {
      console.error('reorder failed', err);
      setItems(items);                           // rollback
      alert('Failed to save new order: ' + err.message);
    }
  };

  if (!items.length) return null;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={items.map((a) => a.id)} strategy={rectSortingStrategy}>
        <section className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
          {items.map((a) => {
            const board = a.boardId ? boardsById[a.boardId] : null;
            return (
              <SortableCard
                key={a.id}
                id={a.id}
                appliance={a}
                houseId={houseId}
                roomId={roomId}
                deviceId={board?.deviceId || a.deviceId || null}
                onEdit={onEdit ? () => onEdit(a) : undefined}
                onChange={onChange}
                draggable={!disabled}
              />
            );
          })}
        </section>
      </SortableContext>
    </DndContext>
  );
}

/** A single ApplianceCard wrapped in dnd-kit's useSortable. */
function SortableCard({
  id,
  appliance,
  houseId,
  roomId,
  deviceId,
  onEdit,
  onChange,
  draggable,
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled: !draggable });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    // Cards being dragged float above the rest of the grid.
    zIndex: isDragging ? 30 : 'auto',
  };

  return (
    <div ref={setNodeRef} style={style}>
      <ApplianceCard
        appliance={appliance}
        houseId={houseId}
        roomId={roomId}
        deviceId={deviceId}
        onEdit={onEdit}
        onFavoriteChanged={onChange}
        dragHandleProps={draggable ? { ...attributes, ...listeners } : undefined}
        isDragging={isDragging}
      />
    </div>
  );
}
