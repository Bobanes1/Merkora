import { fmtClock, usePomodoro } from '../../lib/pomodoro';
import { remaining } from '../../lib/pomodoroRule';
import { useStore } from '../../lib/store';
import { useToolWindows } from '../../lib/toolWindows';
import { IconChecklist, IconTimer } from '../Icons';
import { FloatingWindow } from './FloatingWindow';
import { PomodoroTool } from './PomodoroTool';
import { TodoTool } from './TodoTool';

/**
 * Global overlay that renders open floating tool popups (Pomodoro, To-do-Liste)
 * across all pages of the app.
 */
export function ToolWindows() {
  const wins = useToolWindows();
  const p = usePomodoro();
  const openCount = useStore((s) => (s.data.todos ?? []).filter((t) => !t.doneAt).length);

  const pomoBadge = p.running ? fmtClock(remaining(p, Date.now())) : undefined;
  const todoBadge = openCount > 0 ? `${openCount} offen` : undefined;

  return (
    <div className="tool-wins-layer">
      <FloatingWindow
        id="pomodoro"
        win={wins.pomodoro}
        title="Pomodoro-Timer"
        badge={pomoBadge}
        icon={<IconTimer size={15} />}
        defaultPos={{ right: 24, bottom: 24 }}
        width={310}
      >
        <PomodoroTool compact />
      </FloatingWindow>

      <FloatingWindow
        id="todos"
        win={wins.todos}
        title="To-do-Liste"
        badge={todoBadge}
        icon={<IconChecklist size={15} />}
        defaultPos={{ right: 24, top: 76 }}
        width={360}
      >
        <TodoTool compact />
      </FloatingWindow>
    </div>
  );
}
