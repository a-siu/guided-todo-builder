export function getDayBucket(date: Date): number {
  return date.getUTCDay();
}

export function getHourBucket(date: Date): number {
  return date.getUTCHours();
}
