import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HoverMenu } from './HoverMenu.tsx';

function setup() {
  const onFolder = vi.fn();
  const onFiles = vi.fn();
  render(
    <HoverMenu
      label="Add"
      items={[
        { label: 'Folder', icon: <svg data-testid="folder-icon" />, onSelect: onFolder },
        { label: 'Files', onSelect: onFiles },
      ]}
    />,
  );
  return { onFolder, onFiles, tab: screen.getByRole('button', { name: 'Add' }) };
}

describe('HoverMenu', () => {
  it('lists its items only while the pointer is over it', () => {
    const { tab } = setup();
    expect(screen.queryByRole('menu')).toBeNull();
    fireEvent.mouseEnter(tab.parentElement as HTMLElement);
    expect(screen.getAllByRole('menuitem').map((e) => e.textContent)).toEqual(['Folder', 'Files']);
    fireEvent.mouseLeave(tab.parentElement as HTMLElement);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it("shows an item's icon before its label", () => {
    const { tab } = setup();
    fireEvent.click(tab);
    expect(screen.getByRole('menuitem', { name: 'Folder' }).querySelector('svg')).not.toBeNull();
    expect(screen.getByRole('menuitem', { name: 'Files' }).querySelector('svg')).toBeNull();
  });

  it('reopens when the pointer moves over the tab after a pick', () => {
    const { tab } = setup();
    fireEvent.mouseEnter(tab.parentElement as HTMLElement);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Files' }));
    expect(screen.queryByRole('menu')).toBeNull();
    fireEvent.mouseMove(tab);
    expect(screen.getByRole('menu')).not.toBeNull();
  });

  it('moves along the tab and items with the arrow keys', () => {
    const { tab } = setup();
    act(() => tab.focus());
    const items = screen.getAllByRole('menuitem');
    fireEvent.keyDown(tab, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(items[0] as HTMLElement, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(items[1]);
    fireEvent.keyDown(items[1] as HTMLElement, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(items[1]);
    fireEvent.keyDown(items[1] as HTMLElement, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(items[0]);
  });

  it('runs an item and closes', () => {
    const { tab, onFolder, onFiles } = setup();
    fireEvent.mouseEnter(tab.parentElement as HTMLElement);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Folder' }));
    expect(onFolder).toHaveBeenCalledOnce();
    expect(onFiles).not.toHaveBeenCalled();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('opens on click and focus, and closes on Escape', () => {
    const { tab } = setup();
    fireEvent.click(tab);
    expect(tab.getAttribute('aria-expanded')).toBe('true');
    fireEvent.keyDown(tab, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    fireEvent.focus(tab);
    expect(screen.getByRole('menu')).not.toBeNull();
  });
});
