import { useAmbient } from '../../lib/ambient';
import { fmtClock, usePomodoro } from '../../lib/pomodoro';
import { remaining } from '../../lib/pomodoroRule';
import { useStore } from '../../lib/store';
import { useToolWindows } from '../../lib/toolWindows';
import { IconChecklist, IconHeadphones, IconNote, IconTarget, IconTimer } from '../Icons';
import { CalculatorTool } from './CalculatorTool';
import { FloatingWindow } from './FloatingWindow';
import { PomodoroTool } from './PomodoroTool';
import { ScratchpadTool } from './ScratchpadTool';
import { SoundsTool } from './SoundsTool';
import { TodoTool } from './TodoTool';

/**
 * Global overlay that renders open floating tool popups
 * (Pomodoro, To-dos, Klänge, Notizblock, Rechner) across all pages of the app.
 */
export function ToolWindows() {
  const wins = useToolWindows();
  const p = usePomodoro();
  const amb = useAmbient();
  const openTodos = useStore((s) => (s.data.todos ?? []).filter((t) => !t.doneAt).length);

  const pomoBadge = p.running ? fmtClock(remaining(p, Date.now())) : undefined;
  const soundCount = Object.keys(amb.playing).length;
  const soundBadge = soundCount > 0 ? (amb.paused ? 'Pause' : `${soundCount} aktiv`) : undefined;

  return (
    <div className="tool-wins-layer">
      <FloatingWindow
        id="pomodoro"
        win={wins.pomodoro}
        title="Pomodoro-Timer"
        badge={pomoBadge}
        icon={<IconTimer size={15} />}
        defaultPos={{ right: 24, bottom: 24 }}
        width={244}
      >
        <PomodoroTool compact />
      </FloatingWindow>

      <FloatingWindow
        id="todos"
        win={wins.todos}
        title="To-do-Liste"
        badge={openTodos > 0 ? String(openTodos) : undefined}
        icon={<IconChecklist size={15} />}
        defaultPos={{ right: 280, bottom: 24 }}
        width={310}
      >
        <TodoTool compact />
      </FloatingWindow>

      <FloatingWindow
        id="sounds"
        win={wins.sounds}
        title="Lern-Klänge"
        badge={soundBadge}
        icon={<IconHeadphones size={15} />}
        defaultPos={{ right: 24, bottom: 320 }}
        width={318}
      >
        <SoundsTool compact />
      </FloatingWindow>

      <FloatingWindow
        id="notes"
        win={wins.notes}
        title="Notizblock"
        icon={<IconNote size={15} />}
        defaultPos={{ right: 340, bottom: 80 }}
        width={330}
      >
        <ScratchpadTool compact />
      </FloatingWindow>

      <FloatingWindow
        id="calc"
        win={wins.calc}
        title="Rechner & Einheiten"
        icon={<IconTarget size={15} />}
        defaultPos={{ right: 60, bottom: 120 }}
        width={310}
      >
        <CalculatorTool compact />
      </FloatingWindow>
    </div>
  );
}
