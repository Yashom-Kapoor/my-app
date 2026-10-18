import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NUTRIENTS, type Food } from "@/lib/nutrition";

/** Name, serving, and the five macro inputs (per serving). */
export function FoodFields({ food, defaultName, idPrefix }: { food?: Food; defaultName?: string; idPrefix: string }) {
  return (
    <>
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2 space-y-1.5">
          <Label htmlFor={`${idPrefix}-name`}>Name</Label>
          <Input id={`${idPrefix}-name`} name="name" required defaultValue={food?.name ?? defaultName} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-serving`}>Serving</Label>
          <Input id={`${idPrefix}-serving`} name="serving" placeholder="1 cup" defaultValue={food?.serving ?? ""} />
        </div>
      </div>
      <div className="grid grid-cols-5 gap-2">
        {NUTRIENTS.map(({ key, label, unit }) => (
          <div key={key} className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-${key}`} className="text-xs">
              {label}
              <span className="sr-only"> ({unit})</span>
            </Label>
            <Input
              id={`${idPrefix}-${key}`}
              name={key}
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              placeholder="0"
              defaultValue={food ? food[key] : undefined}
              className="px-2 tabular-nums"
            />
          </div>
        ))}
      </div>
    </>
  );
}
