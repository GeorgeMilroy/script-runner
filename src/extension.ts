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

  // Status bar entry point — the panel is an editor tab, so without this the
  // only ways in are the palette, the keybinding, and package.json menus.
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBarItem.command = 'scriptRunner.open';
  statusBarItem.text = '$(play-circle) Scripts';
  statusBarItem.tooltip = 'Open Script Runner';
  context.subscriptions.push(statusBarItem);
  syncStatusBarVisibility(statusBarItem);

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('scriptRunner.showStatusBarItem')) {
        syncStatusBarVisibility(statusBarItem);
      }
    })
  );

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

function syncStatusBarVisibility(item: vscode.StatusBarItem) {
  const show = vscode.workspace
    .getConfiguration('scriptRunner')
    .get<boolean>('showStatusBarItem', true);

  if (show) {
    item.show();
  } else {
    item.hide();
  }
}

export function deactivate() {
  // ScriptRunnerPanel.currentPanel handles cleanup via onDidDispose
}
