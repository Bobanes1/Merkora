/**
 * Running Java code for programming tasks: one source file with a test class first and the learner's code
 * after it. On the PC the installed Java runs it (Rust: run_java); on the phone (or without Java) the free
 * service wandbox.org does, after asking once.
 * buildHarness / parseResults / mapErrors are pure – tested in scripts/test-srs.mts.
 */
import type { JavaTest } from './practice';

/** Name of the class that holds main (the file is started with it). */
export const MAIN_CLASS = 'MerkoraTest';

const HEAD = `import java.util.*;
import java.util.function.*;
import java.util.stream.*;

`;

/** Lines added before the learner's code (to map compiler line numbers back). */
export function harnessOffset(tests: JavaTest[]): number {
  // the learner's first line comes right after these lines (the harness ends with one more line break)
  return buildHarness('', tests).split('\n').length - 2;
}

/**
 * One file: the test class (prints one line per test, e.g. "#T1|OK", "#T2|FAIL|5", "#T3|ERR|NullPointerException"),
 * then the learner's code. Without tests, the learner's own main is called.
 */
export function buildHarness(userCode: string, tests: JavaTest[]): string {
  const calls = tests
    .map(
      (t, i) => `    try {
      String got = show(${t.call});
      String want = ${JSON.stringify(t.expected)};
      System.out.println(got.equals(want) ? "#T${i + 1}|OK" : "#T${i + 1}|FAIL|" + got.replace("\\n", "\\\\n"));
    } catch (Throwable e) {
      System.out.println("#T${i + 1}|ERR|" + e);
    }`,
    )
    .join('\n');
  const body = tests.length ? calls : '    Solution.main(args);';
  return `${HEAD}class ${MAIN_CLASS} {
  public static void main(String[] args) throws Exception {
${body}
  }
  static String show(Object o) {
    if (o == null) return "null";
    if (o instanceof int[]) return Arrays.toString((int[]) o);
    if (o instanceof long[]) return Arrays.toString((long[]) o);
    if (o instanceof double[]) return Arrays.toString((double[]) o);
    if (o instanceof boolean[]) return Arrays.toString((boolean[]) o);
    if (o instanceof char[]) return Arrays.toString((char[]) o);
    if (o instanceof String[]) return Arrays.toString((String[]) o);
    if (o instanceof Object[]) return Arrays.deepToString((Object[]) o);
    return String.valueOf(o);
  }
  static String show(int v) { return String.valueOf(v); }
  static String show(long v) { return String.valueOf(v); }
  static String show(double v) { return String.valueOf(v); }
  static String show(boolean v) { return String.valueOf(v); }
  static String show(char v) { return String.valueOf(v); }
}

${userCode.replace(/\bpublic\s+(?=(final\s+|abstract\s+)?class\b)/g, '')}
`;
}

export type TestResult = { n: number; ok: boolean; got?: string; error?: string };

/** The test lines of the program output; everything else is the learner's own output. */
export function parseResults(stdout: string, tests: JavaTest[]): { results: TestResult[]; output: string } {
  const results: TestResult[] = tests.map((_, i) => ({ n: i + 1, ok: false, error: 'nicht ausgeführt' }));
  const own: string[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const m = /^#T(\d+)\|(OK|FAIL|ERR)\|?(.*)$/.exec(line);
    if (!m) {
      own.push(line);
      continue;
    }
    const i = Number(m[1]) - 1;
    if (!results[i]) continue;
    results[i] = m[2] === 'OK' ? { n: i + 1, ok: true } : m[2] === 'FAIL' ? { n: i + 1, ok: false, got: m[3].replace(/\\n/g, '\n') } : { n: i + 1, ok: false, error: m[3] };
  }
  return { results, output: own.join('\n').trim() };
}

/** Compiler messages with line numbers of the learner's code ("Zeile 3: …"), the test class left out. */
export function mapErrors(stderr: string, offset: number): string {
  return stderr
    .split(/\r?\n/)
    .map((l) => l.replace(/^(?:.*?[\\/])?(?:prog|Main|MerkoraTest|\w+)\.java:(\d+):\s*(?:error:\s*)?/, (_, n: string) => {
      const line = Number(n) - offset;
      return line >= 1 ? `Zeile ${line}: ` : 'Testcode: ';
    }))
    .filter((l) => l.trim())
    .join('\n')
    .trim();
}

export type RunResult = { stdout: string; stderr: string; compileError: boolean; timedOut: boolean; via: 'local' | 'online' };

/** Wandbox request body for one Java file. */
export const wandboxBody = (code: string, stdin = '') => ({ compiler: WANDBOX_JAVA, code, stdin, save: false });
export const WANDBOX_URL = 'https://wandbox.org/api/compile.json';
export const WANDBOX_JAVA = 'openjdk-jdk-22+36';

/** Installed Java on this PC ("21.0.4"), or null (phone, browser, or not installed). */
export async function localJava(): Promise<string | null> {
  const { inTauri, isAndroid } = await import('./desktop');
  if (!inTauri || isAndroid) return null;
  const { invoke } = await import('@tauri-apps/api/core');
  return (await invoke<string | null>('java_available').catch(() => null)) ?? null;
}

/** Runs a Java file with the installed Java (PC). "no-java" when Java is missing. */
export async function runJavaLocal(code: string, stdin = ''): Promise<RunResult | 'no-java'> {
  const { invoke } = await import('@tauri-apps/api/core');
  try {
    const r = await invoke<{ stdout: string; stderr: string; timedOut: boolean; compileError: boolean }>('run_java', { code, stdin });
    return { stdout: r.stdout, stderr: r.stderr, compileError: r.compileError, timedOut: r.timedOut, via: 'local' };
  } catch (e) {
    if (String(e) === 'NO_JAVA') return 'no-java';
    throw new Error(String(e));
  }
}

/** Runs a Java file at wandbox.org (only the code is sent). Endless loops end there after about a minute. */
export async function runJavaOnline(code: string, stdin = ''): Promise<RunResult> {
  const { netFetch } = await import('./desktop');
  const res = await netFetch(WANDBOX_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(wandboxBody(code, stdin)) });
  if (!res.ok) throw new Error(`Der Online-Dienst antwortet nicht (${res.status}). Bitte später nochmal versuchen.`);
  const j = (await res.json()) as { status?: string; compiler_error?: string; program_output?: string; program_error?: string };
  const compileError = !!j.compiler_error && j.status !== '0';
  return {
    stdout: j.program_output ?? '',
    stderr: compileError ? (j.compiler_error ?? '') : (j.program_error ?? ''),
    compileError,
    timedOut: j.status === '137',
    via: 'online',
  };
}

// ---------- built-in Java (PC): one click, no admin rights, stays inside Merkora's data folder ----------
/** Can this device get the built-in Java? (desktop app only) */
export async function canInstallJava(): Promise<boolean> {
  const { inTauri, isAndroid } = await import('./desktop');
  return inTauri && !isAndroid;
}
/** Version and download size of the Java Merkora would install. */
export async function javaOffer(): Promise<{ version: string; size: number }> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke('java_offer');
}
/** Is Merkora's own Java installed? */
export async function javaBuiltin(): Promise<boolean> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<boolean>('java_builtin').catch(() => false);
}
/** Downloads and installs Java; `onProgress` gets 0–1. Returns the installed version. */
export async function installJava(onProgress: (p: number) => void): Promise<string> {
  const { invoke } = await import('@tauri-apps/api/core');
  const { listen } = await import('@tauri-apps/api/event');
  const off = await listen<number>('java-progress', (e) => onProgress(e.payload));
  try {
    return await invoke<string>('java_install');
  } finally {
    off();
  }
}
export async function uninstallJava(): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('java_uninstall');
}
/** „205 MB“ */
export const sizeText = (bytes: number) => (bytes >= 1e6 ? `${Math.round(bytes / 1e6)} MB` : `${Math.max(1, Math.round(bytes / 1e3))} KB`);
