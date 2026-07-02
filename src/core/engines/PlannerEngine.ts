import type { Engine, EngineContext } from "../engine";
import type { Goal, Task } from "@/types/domain";

interface PlannedTask {
  title: string;
  complexity: number;
}

/**
 * Planner Engine — turns a stated goal into milestones and tasks.
 * Uses the AI provider to decompose the goal, then persists the plan.
 */
export class PlannerEngine implements Engine {
  readonly id = "planner";
  readonly name = "Planner Engine";
  private ctx!: EngineContext;

  start(ctx: EngineContext): void {
    this.ctx = ctx;
  }

  async plan(goalTitle: string): Promise<{ goal: Goal; tasks: Task[] }> {
    const { bus, providers } = this.ctx;
    const db = providers.database;

    const goal = await db.goals.add({
      title: goalTitle,
      description: null,
      status: "active",
    });

    let planned: PlannedTask[] = [];
    try {
      const response = await providers.ai.chat({
        system:
          "You are a planning module. Reply ONLY with a JSON array, no prose, no markdown fences. " +
          'Each item: {"title": string, "complexity": number 1-5}. 4 to 8 items, ordered.',
        messages: [{ role: "user", content: `Break this goal into concrete tasks: ${goalTitle}` }],
        maxTokens: 800,
        temperature: 0.4,
        json: true,
      });
      const clean = response.text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      if (Array.isArray(parsed)) {
        planned = parsed
          .filter((t) => typeof t?.title === "string")
          .map((t) => ({
            title: String(t.title).slice(0, 200),
            complexity: Math.min(5, Math.max(1, Number(t.complexity) || 2)),
          }));
      }
    } catch {
      // Offline or malformed output — fall back to a single umbrella task.
      planned = [{ title: `Work out first steps for: ${goalTitle}`, complexity: 2 }];
    }

    const tasks: Task[] = [];
    for (const p of planned) {
      const task = await db.tasks.add({
        goal_id: goal.id,
        title: p.title,
        status: "todo",
        complexity: p.complexity,
        depends_on: [],
      });
      tasks.push(task);
      await bus.publish("TaskCreated", this.id, { taskId: task.id, goalId: goal.id });
    }

    await bus.publish("PlanCreated", this.id, {
      goalId: goal.id,
      title: goalTitle,
      taskCount: tasks.length,
    });

    return { goal, tasks };
  }
}
