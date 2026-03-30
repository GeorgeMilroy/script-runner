// ===== Script Data Types =====

export interface ScriptInfo {
  name: string;
  command: string;
  workspaceFolder: string;
  workspaceName: string;
  packageManager: string;
}

export type ScriptStatus = 'idle' | 'running' | 'success' | 'error' | 'stopped';

// ===== Message Protocol: Extension -> Webview =====

export type ExtensionToWebviewMessage =
  | { type: 'scriptsLoaded'; scripts: ScriptInfo[]; workspaceFolders: string[] }
  | { type: 'scriptStatusChanged'; scriptId: string; status: ScriptStatus; exitCode?: number }
  | { type: 'scriptOutput'; scriptId: string; data: string }
  | { type: 'scriptOutputCleared'; scriptId: string }
  | { type: 'error'; message: string };

// ===== Message Protocol: Webview -> Extension =====

export type WebviewToExtensionMessage =
  | { type: 'runScript'; scriptId: string }
  | { type: 'stopScript'; scriptId: string }
  | { type: 'refreshScripts' }
  | { type: 'clearOutput'; scriptId: string }
  | { type: 'openUrl'; url: string }
  | { type: 'sendInput'; scriptId: string; data: string }
  | { type: 'ready' };
