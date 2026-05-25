import { patternService } from "./pattern.service";
import { temporalService } from "./temporal.service";
import { transitionService } from "./transition.service";
import { tfidfService } from "./tfidf.service";
import { todoRepository } from "@/lib/repositories/todo.repository";
import { Todo } from "@/lib/types";

export const predictionOrchestrator = {
  async onTodoCreated(todo: Todo, userId: string): Promise<void> {
    const pattern = await patternService.upsertPattern(userId, todo.title);
    await temporalService.recordTime(pattern.id, todo.createdAt);
    const { stemmedTerms } = patternService.normalizeTitle(todo.title);
    await tfidfService.updateTermDf(userId, stemmedTerms);
    await tfidfService.assignToCluster(userId, pattern.id, stemmedTerms);

    const previous = await todoRepository.findMostRecentTodo(userId, todo.id);
    if (previous) {
      const prevPattern = await patternService.upsertPattern(userId, previous.title);
      await transitionService.recordTransition(userId, prevPattern.id, pattern.id);
    }
  },
};
