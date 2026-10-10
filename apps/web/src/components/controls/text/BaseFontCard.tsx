import type { CardProps } from '../../../lib/settingsPanel.ts';
import { clampFontSize } from '../../../lib/textScale.ts';
import { ColorField } from '../../ui/ColorField.tsx';
import { NumInput } from '../../ui/NumInput.tsx';
import { Card } from '../../ui/settings/index.ts';
import { FontSelect } from '../FontSelect.tsx';

/**
 * The Base font card: the font, colour and size every kind of text starts from. Changing the size
 * scales the other text sizes with it (`onSize`, usually through `scaleFontSizes`).
 */
export function BaseFontCard({
  card,
  font,
  defaultFont,
  onFont,
  color,
  colorAtDefault,
  defaultColorName = 'black',
  onColor,
  onResetColor,
  size,
  onSize,
  sizeTitle,
}: {
  card: CardProps;
  font: string;
  defaultFont: string;
  onFont: (font: string) => void;
  /** The colour shown: the base font colour, or the default it falls back to. */
  color: string;
  colorAtDefault: boolean;
  /** Names the default colour in the reset button's tooltip. */
  defaultColorName?: string;
  /** `merge` groups the changes of one colour pick into one undo step. */
  onColor: (color: string, merge: string) => void;
  onResetColor: () => void;
  size: number;
  /** Called only when the size changes. */
  onSize: (px: number) => void;
  /** The size field's tooltip: which sizes it scales. */
  sizeTitle: string;
}) {
  return (
    <Card {...card}>
      <FontSelect label="Base font" value={font} onChange={(v) => onFont(v ?? defaultFont)} />
      <ColorField
        inline
        label="Base font color"
        value={color}
        onChange={(v) => onColor(v, 'fontColor')}
        reset={{
          disabled: colorAtDefault,
          label: `Reset base font color to ${defaultColorName}`,
          title: colorAtDefault
            ? 'Base font color is the default'
            : `Reset base font color to ${defaultColorName}`,
          onReset: onResetColor,
        }}
      />
      <NumInput
        live
        label="Base font size (px)"
        step={0.5}
        title={sizeTitle}
        value={size}
        onCommit={(v) => clampFontSize(v) !== size && onSize(v)}
      />
    </Card>
  );
}
