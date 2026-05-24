import { predictionRepository } from "@/lib/repositories/prediction.repository";
import { Pattern } from "@/lib/types";

export const temporalService = {
  getDayBucket(date: Date): number {
    return date.getUTCDay();
  },

  getHourBucket(date: Date): number {
    return date.getUTCHours();
  },

  async recordTime(patternId: string, date: Date): Promise<void> {
    const hourBucket = this.getHourBucket(date);
    const dayBucket = this.getDayBucket(date);
    await predictionRepository.upsertTemporal(patternId, hourBucket, dayBucket);
  },

  async getTopForTimeSlot(userId: string, date: Date, limit: number): Promise<{ pattern: Pattern; count: number }[]> {
    const hourBucket = this.getHourBucket(date);
    const dayBucket = this.getDayBucket(date);
    return predictionRepository.findTopTemporal(userId, hourBucket, dayBucket, limit);
  },
};
