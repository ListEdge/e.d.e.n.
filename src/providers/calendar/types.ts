/** Calendar provider contract. */
export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  location?: string;
}

export interface CalendarProvider {
  readonly id: string;
  available(): boolean;
  upcoming(limit?: number): Promise<CalendarEvent[]>;
  create(event: Omit<CalendarEvent, "id">): Promise<CalendarEvent>;
}
