export interface Clock { now(): Date; }
export class SystemClock implements Clock { public now(): Date { return new Date(); } }
export class FakeClock implements Clock { private current: Date; public constructor(initial: Date) { this.current = new Date(initial); } public now(): Date { return new Date(this.current); } public advance(milliseconds: number): void { this.current = new Date(this.current.getTime() + milliseconds); } public set(value: Date): void { this.current = new Date(value); } }
