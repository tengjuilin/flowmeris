import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReorderList, useRowSelection } from './ReorderList.tsx';

const IDS = ['a', 'b', 'c', 'd'];
const dataTransfer = () => ({ setData: vi.fn(), setDragImage: vi.fn(), effectAllowed: '' });
const grip = (id: string) => screen.getByLabelText(`Drag ${id} to reorder`);
const row = (id: string) => grip(id).closest('li')!;

/** Drag row `from`'s grip and drop it on the top half of row `to`. */
function drag(from: string, to: string) {
  fireEvent.dragStart(grip(from), { dataTransfer: dataTransfer() });
  fireEvent.dragOver(row(to), { dataTransfer: dataTransfer() });
  fireEvent.drop(row(to), { dataTransfer: dataTransfer() });
}

function Selectable({ onMove }: { onMove: (ids: string[], target: string, after: boolean) => void }) {
  const selection = useRowSelection(IDS);
  return (
    <>
      <ReorderList ids={IDS} name={(id) => id} gripTitle="Drag" onMove={onMove} selection={selection}>
        {(id) => <input aria-label={`Label of ${id}`} />}
      </ReorderList>
      <output>{[...selection.selected].join(',')}</output>
      <output aria-label="targets">{selection.targets('b').join(',')}</output>
    </>
  );
}

describe('ReorderList', () => {
  it('moves a dragged row before the row it is dropped on', () => {
    const onMove = vi.fn();
    render(
      <ReorderList ids={IDS} name={(id) => id} gripTitle="Drag" onMove={onMove}>
        {() => null}
      </ReorderList>,
    );
    drag('c', 'a');
    expect(onMove).toHaveBeenCalledWith(['c'], 'a', false);
    expect(row('a').className).toBe('');
  });

  it('marks the dragged row and the drop position while dragging', () => {
    render(
      <ReorderList ids={IDS} name={(id) => id} gripTitle="Drag" onMove={() => {}}>
        {() => null}
      </ReorderList>,
    );
    fireEvent.dragStart(grip('b'), { dataTransfer: dataTransfer() });
    fireEvent.dragOver(row('d'), { dataTransfer: dataTransfer() });
    expect(row('b').className).toBe('dragging');
    expect(row('d').className).toBe('drop-before');
  });

  it('selects rows by click, ⌘/Ctrl-click and Shift-click, but not from a row’s inputs', () => {
    render(<Selectable onMove={() => {}} />);
    const selected = () => screen.getAllByRole('status')[0]!.textContent;
    fireEvent.click(row('b'));
    expect(selected()).toBe('b');
    fireEvent.click(row('d'), { shiftKey: true });
    expect(selected()).toBe('b,c,d');
    fireEvent.click(row('c'), { metaKey: true });
    expect(selected()).toBe('b,d');
    expect(row('c').className).toBe('');
    expect(row('d').className).toBe('selected');
    expect(screen.getByLabelText('targets').textContent).toBe('b,d');
    fireEvent.click(screen.getByLabelText('Label of a'));
    expect(selected()).toBe('b,d');
  });

  it('drags the whole selection from a selected row, and only the row from another', () => {
    const onMove = vi.fn();
    render(<Selectable onMove={onMove} />);
    fireEvent.click(row('b'));
    fireEvent.click(row('d'), { ctrlKey: true });
    drag('d', 'a');
    expect(onMove).toHaveBeenLastCalledWith(['b', 'd'], 'a', false);
    drag('c', 'a');
    expect(onMove).toHaveBeenLastCalledWith(['c'], 'a', false);
    expect(screen.getAllByRole('status')[0]!.textContent).toBe('c');
  });
});
