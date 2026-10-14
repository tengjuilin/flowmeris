import { describe, expect, it } from 'vitest';
import {
  DEFAULT_HOTKEYS,
  HOTKEY_ACTIONS,
  type KeyLike,
  comboOf,
  formatCombo,
  hotkeyConflicts,
  hotkeyMatches,
  hotkeyOverrides,
  isCombo,
  keyHint,
  matchHotkey,
  resetHotkey,
  resolveHotkeys,
  setHotkey,
} from './hotkeys.ts';

const key = (k: string, mods: Partial<KeyLike & { code: string }> = {}) => ({
  key: k,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
});

describe('comboOf', () => {
  it('names letters in upper case, with Mod for ⌘ or Ctrl', () => {
    expect(comboOf(key('v'))).toBe('V');
    expect(comboOf(key('z', { metaKey: true }))).toBe('Mod+Z');
    expect(comboOf(key('z', { ctrlKey: true }))).toBe('Mod+Z');
    expect(comboOf(key('Z', { metaKey: true, shiftKey: true }))).toBe('Mod+Shift+Z');
  });

  it('keeps named keys, and drops Shift from a typed character', () => {
    expect(comboOf(key('ArrowLeft', { altKey: true }))).toBe('Alt+ArrowLeft');
    expect(comboOf(key('Backspace'))).toBe('Backspace');
    expect(comboOf(key('+', { shiftKey: true }))).toBe('+');
    expect(comboOf(key(' '))).toBe('Space');
  });

  it('reads Alt+letter from the key code, as a Mac types another character', () => {
    expect(comboOf(key('π', { altKey: true, code: 'KeyP' }))).toBe('Alt+P');
  });

  it('gives nothing for a modifier alone or Tab', () => {
    for (const k of ['Shift', 'Meta', 'Control', 'Alt', 'Tab']) expect(comboOf(key(k))).toBeNull();
  });
});

describe('parse and format', () => {
  it('accepts combinations, including a + key', () => {
    for (const c of ['V', 'Mod+Shift+Z', 'Alt+ArrowLeft', '+', 'Mod++', 'Escape'])
      expect(isCombo(c)).toBe(true);
    for (const c of ['', 'v', 'Shift', 'Mod+', 'Tab', 'Mod+Mod+Z']) expect(isCombo(c)).toBe(false);
  });

  it('shows keys the Mac way or with words', () => {
    expect(formatCombo('Mod+Shift+Z', true)).toBe('⇧⌘Z');
    expect(formatCombo('Mod+Shift+Z', false)).toBe('Ctrl+Shift+Z');
    expect(formatCombo('Alt+ArrowLeft', true)).toBe('⌥←');
    expect(formatCombo('Backspace', false)).toBe('Backspace');
    expect(keyHint(DEFAULT_HOTKEYS, 'redo', true)).toBe(' (⇧⌘Z)');
    expect(keyHint({ ...DEFAULT_HOTKEYS, redo: [] }, 'redo', true)).toBe('');
  });
});

describe('matching', () => {
  it('runs an action on its keys only', () => {
    expect(matchHotkey(DEFAULT_HOTKEYS, ['undo', 'redo'], key('z', { metaKey: true }))).toBe('undo');
    expect(matchHotkey(DEFAULT_HOTKEYS, ['undo', 'redo'], key('Z', { ctrlKey: true, shiftKey: true }))).toBe(
      'redo',
    );
    expect(matchHotkey(DEFAULT_HOTKEYS, ['tool.rect'], key('r', { metaKey: true }))).toBeUndefined();
  });

  it('runs a nudge with Shift too (the 10 px step)', () => {
    expect(hotkeyMatches(DEFAULT_HOTKEYS, 'gate.left', key('ArrowLeft', { shiftKey: true }))).toBe(true);
    expect(hotkeyMatches(DEFAULT_HOTKEYS, 'gate.delete', key('Delete', { shiftKey: true }))).toBe(false);
  });
});

describe('changing keys', () => {
  it('moves a key from an action that would run at the same time', () => {
    const k = setHotkey(DEFAULT_HOTKEYS, 'tool.rect', 'V');
    expect(k['tool.rect']).toEqual(['V']);
    expect(k['tool.select']).toEqual([]);
  });

  it('lets actions that never take a key at the same time share it', () => {
    expect(hotkeyConflicts(DEFAULT_HOTKEYS, 'gate.delete', 'Backspace')).toEqual([]);
    const k = setHotkey(DEFAULT_HOTKEYS, 'gate.deselect', 'Backspace');
    expect(k['gate.delete']).toEqual(['Delete']);
    expect(k['polygon.undoVertex']).toEqual(['Backspace']);
    expect(k['grid.delete']).toEqual(['Delete', 'Backspace']);
  });

  it('takes a general key from every scope', () => {
    const k = setHotkey(DEFAULT_HOTKEYS, 'undo', 'Escape');
    expect(k['grid.cancelCut']).toEqual([]);
    expect(k['gate.deselect']).toEqual([]);
    expect(k['polygon.cancel']).toEqual([]);
  });

  it('sets a nudge without Shift', () => {
    expect(setHotkey(DEFAULT_HOTKEYS, 'gate.up', 'Shift+K')['gate.up']).toEqual(['K']);
  });

  it('resets an action to its default keys, taking them back', () => {
    const moved = setHotkey(DEFAULT_HOTKEYS, 'tool.rect', 'V');
    const back = resetHotkey(moved, 'tool.select');
    expect(back['tool.select']).toEqual(['V']);
    expect(back['tool.rect']).toEqual([]);
  });

  it('keeps only changed actions as overrides', () => {
    expect(hotkeyOverrides(DEFAULT_HOTKEYS)).toEqual({});
    const k = setHotkey(DEFAULT_HOTKEYS, 'tool.rect', 'V');
    const o = hotkeyOverrides(k);
    expect(o).toEqual({ 'tool.rect': ['V'], 'tool.select': [] });
    expect(resolveHotkeys(o)).toEqual(k);
  });

  it('has no conflicting default keys', () => {
    for (const a of HOTKEY_ACTIONS)
      for (const c of a.keys) expect(hotkeyConflicts(DEFAULT_HOTKEYS, a.id, c), `${a.id} ${c}`).toEqual([]);
  });
});
