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
  defaultColor,
  onColor,
  size,
  onSize,
  sizeTitle,
}: {
  card: CardProps;
  font: string;
  defaultFont: string;
  onFont: (font: string) => void;
  color: string;
  defaultColor: string;
  /** `merge` is set while the colour is being picked, so one pick is one undo step. */
  onColor: (color: string, merge?: string) => void;
  size: number;
  /** Called only when the size changes. */
  onSize: (px: number) => void;
  /** The size field's tooltip: which sizes it scales. */
  sizeTitle: string;
}) {
  const atDefault = color === defaultColor;
  return (
    <Card {...card}>
      <FontSelect label="Base font" value={font} onChange={(v) => onFont(v ?? defaultFont)} />
      <ColorField
        inline
        label="Base font color"
        value={color}
        onChange={(v) => onColor(v, 'fontColor')}
        reset={{
          disabled: atDefault,
          label: 'Reset base font color to black',
          title: atDefault ? 'Base font color is the default' : 'Reset base font color to black',
          onReset: () => onColor(defaultColor),
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
