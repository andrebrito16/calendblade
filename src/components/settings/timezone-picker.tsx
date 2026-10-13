"use client";

import { Check, ChevronsUpDown } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supportedTimezones } from "@/lib/timezones";
import { cn } from "@/lib/utils";

function offsetLabel(zone: string) {
  try {
    const part = new Intl.DateTimeFormat("en", { timeZone: zone, timeZoneName: "shortOffset" })
      .formatToParts(new Date())
      .find((entry) => entry.type === "timeZoneName");
    return part?.value.replace("GMT", "UTC") ?? "";
  } catch {
    return "";
  }
}

/** Searchable IANA time zone combobox. */
export function TimezonePicker({
  id,
  value,
  onChange,
  invalid,
  searchPlaceholder,
  emptyLabel,
}: {
  id?: string;
  value: string;
  onChange: (zone: string) => void;
  invalid?: boolean;
  searchPlaceholder: string;
  emptyLabel: string;
}) {
  const [open, setOpen] = useState(false);
  // Offsets depend on "now", so compute them only once the picker opens (never during SSR).
  const zones = useMemo(
    () => (open ? supportedTimezones().map((zone) => ({ zone, offset: offsetLabel(zone) })) : []),
    [open],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid}
          className="w-full justify-between font-normal"
        >
          <span className="truncate">{value.replaceAll("_", " ")}</span>
          <ChevronsUpDown className="opacity-50" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-72 p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyLabel}</CommandEmpty>
            <CommandGroup>
              {zones.map(({ zone, offset }) => (
                <CommandItem
                  key={zone}
                  value={`${zone} ${offset}`}
                  onSelect={() => {
                    onChange(zone);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn("size-4", value === zone ? "opacity-100" : "opacity-0")}
                    aria-hidden="true"
                  />
                  <span className="flex-1 truncate">{zone.replaceAll("_", " ")}</span>
                  <span className="text-xs text-muted-foreground">{offset}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
