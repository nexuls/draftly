import { Switch } from "@/components/ui/switch";

/**
 * One labelled toggle.
 *
 * The description says what turning it *off* costs, because the playground opens with
 * everything on and the useful experiment is taking a feature away.
 *
 * @param props.id - Ties the label to the switch
 * @param props.label - The option's name
 * @param props.description - What the option does, in plain language
 * @param props.checked - Current state
 * @param props.onCheckedChange - Called with the new state
 * @returns The row element
 */
export function ConfigSwitch({
  id,
  label,
  description,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <div className="min-w-0">
        <label htmlFor={id} className="text-foreground block cursor-pointer text-sm">
          {label}
        </label>
        <p className="text-muted-foreground mt-0.5 text-xs">{description}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} className="mt-0.5 shrink-0" />
    </div>
  );
}
