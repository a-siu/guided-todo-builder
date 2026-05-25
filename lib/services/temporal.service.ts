import { temporalRepository } from "@/lib/repositories/temporal.repository";
import { getDayBucket, getHourBucket } from "@/lib/utils/time";
import { Pattern } from "@/lib/types";

export const temporalService = {
  async recordTime(patternId: string, date: Date): Promise<void> {
    const hourBucket = getHourBucket(date);
    const dayBucket = getDayBucket(date);
    await temporalRepository.upsertTemporal(patternId, hourBucket, dayBucket);
  },

  async getTopForTimeSlot(userId: string, date: Date, limit: number): Promise<{ pattern: Pattern; count: number }[]> {
    const hourBucket = getHourBucket(date);
    const dayBucket = getDayBucket(date);
    return temporalRepository.findTopTemporal(userId, hourBucket, dayBucket, limit);
  },
};
