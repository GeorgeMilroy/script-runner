import * as vscode from 'vscode';
import { ScriptRunnerPanel } from './ScriptRunnerPanel';

export function activate(context: vscode.ExtensionContext) {
  const openCommand = vscode.commands.registerCommand('scriptRunner.open', () => {
    ScriptRunnerPanel.createOrShow(context);
  });

  const refreshCommand = vscode.commands.registerCommand('scriptRunner.refresh', () => {
    ScriptRunnerPanel.currentPanel?.refresh();
  });

  context.subscriptions.push(openCommand, refreshCommand);

  // Restore panel on VS Code restart
  vscode.window.registerWebviewPanelSerializer(ScriptRunnerPanel.viewType, {
    async deserializeWebviewPanel(panel: vscode.WebviewPanel, _state: unknown) {
      ScriptRunnerPanel.revive(panel, context);
    },
  });

  // Watch for workspace folder changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      ScriptRunnerPanel.currentPanel?.refresh();
    })
  );

  // Watch for package.json changes to auto-refresh
  const packageJsonWatcher = vscode.workspace.createFileSystemWatcher('**/package.json');
  packageJsonWatcher.onDidChange(() => ScriptRunnerPanel.currentPanel?.refresh());
  packageJsonWatcher.onDidCreate(() => ScriptRunnerPanel.currentPanel?.refresh());
  packageJsonWatcher.onDidDelete(() => ScriptRunnerPanel.currentPanel?.refresh());
  context.subscriptions.push(packageJsonWatcher);
}

export function deactivate() {
  // ScriptRunnerPanel.currentPanel handles cleanup via onDidDispose
}
