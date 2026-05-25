import { patternRepository } from "@/lib/repositories/pattern.repository";
import { clusterRepository } from "@/lib/repositories/cluster.repository";
import { CLUSTER_SIMILARITY_THRESHOLD} from "@/lib/config/common";

export const tfidfService = {
  async updateTermDf(userId: string, stemmedTerms: string[]): Promise<void> {
    for (const term of stemmedTerms) {
      await clusterRepository.upsertTermDf(userId, term);
    }
  },

  async computeTfIdf(userId: string, stemmedTerms: string[]): Promise<Record<string, number>> {
    const termDfs = await clusterRepository.getTermDfs(userId);
    const dfMap = new Map(termDfs.map((t) => [t.term, t.df]));
    const allPatterns = await patternRepository.getAllPatterns(userId);
    const totalPatterns = allPatterns.length || 1;

    const vector: Record<string, number> = {};
    const docLength = stemmedTerms.length || 1;

    for (const term of stemmedTerms) {
      const tf = stemmedTerms.filter((t) => t === term).length / docLength;
      const df = dfMap.get(term) || 1;
      const idf = Math.log(totalPatterns / df);
      vector[term] = tf * idf;
    }

    return vector;
  },

  async assignToCluster(userId: string, patternId: string, stemmedTerms: string[]): Promise<string> {
    const vector = await this.computeTfIdf(userId, stemmedTerms);
    const clusters = await clusterRepository.findClusters(userId);

    let bestClusterId: string | null = null;
    let bestScore = 0;

    for (const cluster of clusters) {
      const centroid = cluster.centroid as Record<string, number>;
      let score = 0;
      for (const term of Object.keys(vector)) {
        if (centroid[term]) {
          score += Math.min(vector[term], centroid[term]);
        }
      }
      if (score > bestScore) {
        bestScore = score;
        bestClusterId = cluster.id;
      }
    }

    if (bestClusterId && bestScore >= CLUSTER_SIMILARITY_THRESHOLD) {
      const centroid = clusters.find((c) => c.id === bestClusterId)!.centroid as Record<string, number>;
      const cluster = clusters.find((c) => c.id === bestClusterId)!;
      const newCount = (cluster.memberCount ?? 1) + 1;
      const newCentroid: Record<string, number> = {};
      for (const term of Array.from(new Set([...Object.keys(centroid), ...Object.keys(vector)]))) {
        const oldW = centroid[term] ?? 0;
        const newW = vector[term] ?? 0;
        newCentroid[term] = oldW + (newW - oldW) / newCount;
      }
      await clusterRepository.updateClusterCentroid(bestClusterId, newCentroid, newCount);
      await patternRepository.assignPatternToCluster(patternId, bestClusterId);
      return bestClusterId;
    }

    const cluster = await clusterRepository.createCluster(userId, vector);
    await patternRepository.assignPatternToCluster(patternId, cluster.id);
    return cluster.id;
  },
};
