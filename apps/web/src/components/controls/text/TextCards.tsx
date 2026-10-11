import type { RidgeStyle, TextStyle } from '@flowmeris/model';
import type { ReactNode } from 'react';
import type { CardProps } from '../../../lib/settingsPanel.ts';
import { Card } from '../../ui/settings/index.ts';
import { TextStyleEditor } from '../TextStyleEditor.tsx';

/** One kind of text in a Text tab: its card, its style and size, and how to change them. */
export interface TextEntry {
  card: CardProps;
  /** Names the editor's fields: "Tick labels" → "Tick labels font", "Bold tick labels". */
  label: string;
  value: TextStyle;
  onChange: (t: TextStyle) => void;
  size: number;
  onSize: (px: number) => void;
  align?: RidgeStyle['labelAlign'];
  onAlign?: (a: RidgeStyle['labelAlign']) => void;
  /** More settings for this text, below its style. */
  extra?: ReactNode;
}

/**
 * The cards of a Text tab, one per kind of text, each a `TextStyleEditor` whose font and color default
 * to the base font `base` and color `baseColor`.
 */
export function TextCards({
  base,
  baseColor,
  entries,
}: { base: string; baseColor: string; entries: TextEntry[] }) {
  return (
    <>
      {entries.map((e) => (
        <Card key={e.card.id} {...e.card}>
          <TextStyleEditor
            label={e.label}
            value={e.value}
            base={base}
            baseColor={baseColor}
            onChange={e.onChange}
            size={e.size}
            onSize={e.onSize}
            align={e.align}
            onAlign={e.onAlign}
          />
          {e.extra}
        </Card>
      ))}
    </>
  );
}
