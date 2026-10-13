/** Google Calendar event color ids and their swatches. */
export const eventColors = [
  { id: "1", hex: "#7986cb" },
  { id: "2", hex: "#33b679" },
  { id: "3", hex: "#8e24aa" },
  { id: "4", hex: "#e67c73" },
  { id: "5", hex: "#f6bf26" },
  { id: "6", hex: "#f4511e" },
  { id: "7", hex: "#039be5" },
  { id: "8", hex: "#616161" },
  { id: "9", hex: "#3f51b5" },
  { id: "10", hex: "#0b8043" },
  { id: "11", hex: "#d50000" },
] as const;

export type EventColorId = (typeof eventColors)[number]["id"];

export function eventColorHex(id: string | null | undefined) {
  return eventColors.find((color) => color.id === id)?.hex ?? null;
}
