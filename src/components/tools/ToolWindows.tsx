import { fmtClock, usePomodoro } from '../../lib/pomodoro';
import { remaining } from '../../lib/pomodoroRule';
import { useToolWindows } from '../../lib/toolWindows';
import { IconTimer } from '../Icons';
import { FloatingWindow } from './FloatingWindow';
import { PomodoroTool } from './PomodoroTool';

/**
 * Global overlay that renders open floating tool popups (Pomodoro, To-do-Liste)
 * across all pages of the app.
 */
export function ToolWindows() {
  const wins = useToolWindows();
  const p = usePomodoro();

  const pomoBadge = p.running ? fmtClock(remaining(p, Date.now())) : undefined;

  return (
    <div className="tool-wins-layer">
      <FloatingWindow
        id="pomodoro"
        win={wins.pomodoro}
        title="Pomodoro-Timer"
        badge={pomoBadge}
        icon={<IconTimer size={15} />}
        defaultPos={{ right: 24, bottom: 24 }}
        width={236}
      >
        <PomodoroTool compact />
      </FloatingWindow>

    </div>
  );
}
