import { spawn, ChildProcess } from 'child_process';
import type { ScriptInfo } from './types';
import { getScriptId } from './scriptDiscovery';

interface RunCallbacks {
  onStart: () => void;
  onOutput: (data: string) => void;
  onExit: (code: number | null) => void;
  onError: (err: string) => void;
}

interface RunningScript {
  process: ChildProcess;
  info: ScriptInfo;
}

export class ScriptExecutor {
  private _scriptRegistry = new Map<string, ScriptInfo>();
  private _running = new Map<string, RunningScript>();

  public registerScripts(scripts: ScriptInfo[]): void {
    this._scriptRegistry.clear();
    for (const s of scripts) {
      const id = getScriptId(s.workspaceFolder, s.name);
      this._scriptRegistry.set(id, s);
    }
  }

  public run(scriptId: string, callbacks: RunCallbacks): void {
    // If already running, stop the previous instance first
    if (this._running.has(scriptId)) {
      this.stop(scriptId);
    }

    const info = this._scriptRegistry.get(scriptId);
    if (!info) {
      callbacks.onError(`Script not found: ${scriptId}`);
      return;
    }

    const pm = info.packageManager;
    const isWindows = process.platform === 'win32';

    const child = spawn(pm, ['run', info.name], {
      cwd: info.workspaceFolder,
      shell: isWindows ? true : '/bin/sh',
      env: { ...process.env, FORCE_COLOR: '1' },
      windowsHide: true,
    });

    this._running.set(scriptId, { process: child, info });
    callbacks.onStart();

    child.stdout?.on('data', (data: Buffer) => {
      callbacks.onOutput(data.toString());
    });

    child.stderr?.on('data', (data: Buffer) => {
      callbacks.onOutput(data.toString());
    });

    child.on('error', (err: Error) => {
      this._running.delete(scriptId);
      callbacks.onError(err.message);
    });

    child.on('close', (code: number | null) => {
      this._running.delete(scriptId);
      callbacks.onExit(code);
    });
  }

  public sendInput(scriptId: string, data: string): void {
    const running = this._running.get(scriptId);
    if (!running || !running.process.stdin || running.process.stdin.destroyed) { return; }
    running.process.stdin.write(data);
  }

  public stop(scriptId: string): void {
    const running = this._running.get(scriptId);
    if (!running) { return; }

    const isWindows = process.platform === 'win32';
    const pid = running.process.pid;

    if (isWindows && pid) {
      // On Windows, kill the entire process tree
      spawn('taskkill', ['/pid', String(pid), '/T', '/F'], {
        windowsHide: true,
      });
    } else {
      running.process.kill('SIGTERM');
      // Force kill after 5 seconds if still running
      const scriptIdCopy = scriptId;
      setTimeout(() => {
        if (this._running.has(scriptIdCopy)) {
          running.process.kill('SIGKILL');
        }
      }, 5000);
    }

    this._running.delete(scriptId);
  }

  public stopAll(): void {
    for (const scriptId of [...this._running.keys()]) {
      this.stop(scriptId);
    }
  }

  public isRunning(scriptId: string): boolean {
    return this._running.has(scriptId);
  }
}
