import type { ReactNode } from 'react';
import type { CardProps } from '../../../lib/settingsPanel.ts';
import { ActionRow } from '../ActionRow.tsx';
import { ApplyIcon, ResetIcon } from '../icons.tsx';
import { Card } from './Card.tsx';

/** One button of a Settings-tab card: "Apply same settings for all charts", "All settings in this plot". */
export interface SettingsAction {
  label: string;
  /** The button's tooltip and accessible name. */
  title: string;
  disabled?: boolean;
  run: () => void;
  /** In place of the card's icon. */
  icon?: ReactNode;
}

/** A checkbox of a Settings-tab card: "Carry settings to next populations". */
export interface SettingsCheck {
  label: string;
  title: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (on: boolean) => void;
}

/** A Settings-tab card: a button per action, each with `icon` unless it has its own, then the checkboxes. */
export function ActionsCard({
  card,
  icon,
  actions,
  checks = [],
}: { card: CardProps; icon?: ReactNode; actions: SettingsAction[]; checks?: SettingsCheck[] }) {
  return (
    <Card {...card}>
      {actions.map((a) => (
        <ActionRow
          key={a.label}
          label={a.label}
          title={a.title}
          icon={a.icon ?? icon}
          disabled={!!a.disabled}
          onClick={a.run}
        />
      ))}
      {checks.map((c) => (
        <label key={c.label} className="field check" title={c.title}>
          <input
            type="checkbox"
            checked={c.checked}
            disabled={c.disabled}
            onChange={(e) => c.onChange(e.target.checked)}
          />
          {c.label}
        </label>
      ))}
    </Card>
  );
}

/** "Apply settings": apply this plot's settings to others now, and carry them to the plots opened next. */
export const ApplyCard = (props: {
  card: CardProps;
  actions: SettingsAction[];
  checks?: SettingsCheck[];
}) => <ActionsCard icon={<ApplyIcon />} {...props} />;

/** "Reset settings": reset at several scopes, from this plot to every plot. */
export const ResetCard = (props: { card: CardProps; actions: SettingsAction[] }) => (
  <ActionsCard icon={<ResetIcon />} {...props} />
);
