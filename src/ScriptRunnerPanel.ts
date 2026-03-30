import * as vscode from 'vscode';
import { discoverScripts } from './scriptDiscovery';
import { ScriptExecutor } from './scriptExecutor';
import type { WebviewToExtensionMessage, ExtensionToWebviewMessage } from './types';

export class ScriptRunnerPanel {
  public static readonly viewType = 'scriptRunner';
  public static currentPanel: ScriptRunnerPanel | undefined;

  private readonly _panel: vscode.WebviewPanel;
  private readonly _context: vscode.ExtensionContext;
  private readonly _executor: ScriptExecutor;
  private _disposables: vscode.Disposable[] = [];
  private _isReady = false;
  private _pendingMessages: ExtensionToWebviewMessage[] = [];

  private constructor(panel: vscode.WebviewPanel, context: vscode.ExtensionContext) {
    this._panel = panel;
    this._context = context;
    this._executor = new ScriptExecutor();

    this._panel.webview.html = this._getHtmlForWebview();

    this._panel.webview.onDidReceiveMessage(
      (message: WebviewToExtensionMessage) => this._handleWebviewMessage(message),
      null,
      this._disposables
    );

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
  }

  public static createOrShow(context: vscode.ExtensionContext): void {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : vscode.ViewColumn.One;

    if (ScriptRunnerPanel.currentPanel) {
      ScriptRunnerPanel.currentPanel._panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      ScriptRunnerPanel.viewType,
      'Script Runner',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview'),
          vscode.Uri.joinPath(context.extensionUri, 'src', 'webview'),
          vscode.Uri.joinPath(context.extensionUri, 'media'),
        ],
      }
    );

    panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'icon.svg');
    ScriptRunnerPanel.currentPanel = new ScriptRunnerPanel(panel, context);
  }

  public static revive(panel: vscode.WebviewPanel, context: vscode.ExtensionContext): void {
    ScriptRunnerPanel.currentPanel = new ScriptRunnerPanel(panel, context);
  }

  public async refresh(): Promise<void> {
    const scripts = await discoverScripts();
    this._executor.registerScripts(scripts);
    this._postMessage({
      type: 'scriptsLoaded',
      scripts,
      workspaceFolders: [],
    });
  }

  private async _handleWebviewMessage(message: WebviewToExtensionMessage): Promise<void> {
    switch (message.type) {
      case 'ready':
        this._isReady = true;
        for (const msg of this._pendingMessages) {
          this._panel.webview.postMessage(msg);
        }
        this._pendingMessages = [];
        await this.refresh();
        break;

      case 'runScript':
        this._runScript(message.scriptId);
        break;

      case 'stopScript':
        this._executor.stop(message.scriptId);
        break;

      case 'refreshScripts':
        await this.refresh();
        break;

      case 'clearOutput':
        this._postMessage({ type: 'scriptOutputCleared', scriptId: message.scriptId });
        break;

      case 'openUrl':
        vscode.env.openExternal(vscode.Uri.parse(message.url));
        break;

      case 'sendInput':
        this._executor.sendInput(message.scriptId, message.data);
        break;
    }
  }

  private _runScript(scriptId: string): void {
    const config = vscode.workspace.getConfiguration('scriptRunner');
    const clearOnRerun = config.get<boolean>('clearOutputOnRerun', true);

    if (clearOnRerun) {
      this._postMessage({ type: 'scriptOutputCleared', scriptId });
    }

    this._executor.run(scriptId, {
      onStart: () => {
        this._postMessage({ type: 'scriptStatusChanged', scriptId, status: 'running' });
      },
      onOutput: (data: string) => {
        this._postMessage({ type: 'scriptOutput', scriptId, data });
      },
      onExit: (code: number | null) => {
        const status = code === 0 ? 'success' : code === null ? 'stopped' : 'error';
        this._postMessage({
          type: 'scriptStatusChanged',
          scriptId,
          status,
          exitCode: code ?? undefined,
        });
      },
      onError: (err: string) => {
        this._postMessage({
          type: 'scriptOutput',
          scriptId,
          data: `\x1b[31mError: ${err}\x1b[0m\n`,
        });
        this._postMessage({ type: 'scriptStatusChanged', scriptId, status: 'error' });
      },
    });
  }

  private _postMessage(message: ExtensionToWebviewMessage): void {
    if (!this._isReady) {
      this._pendingMessages.push(message);
      return;
    }
    this._panel.webview.postMessage(message);
  }

  private _getWebviewUri(fileName: string): vscode.Uri {
    const webview = this._panel.webview;
    // Try dist/webview first (packaged), fall back to src/webview (dev)
    const distUri = vscode.Uri.joinPath(this._context.extensionUri, 'dist', 'webview', fileName);
    const srcUri = vscode.Uri.joinPath(this._context.extensionUri, 'src', 'webview', fileName);

    // In a packaged extension, dist/webview exists. In dev, src/webview exists.
    // Try dist first since that's the production path.
    try {
      return webview.asWebviewUri(distUri);
    } catch {
      return webview.asWebviewUri(srcUri);
    }
  }

  private _getHtmlForWebview(): string {
    const webview = this._panel.webview;
    const nonce = getNonce();

    // Resolve both paths — webview will load whichever exists
    const distBase = vscode.Uri.joinPath(this._context.extensionUri, 'dist', 'webview');
    const srcBase = vscode.Uri.joinPath(this._context.extensionUri, 'src', 'webview');

    // Use dist/webview as primary (packaged extension), src/webview as fallback (dev)
    const styleUriDist = webview.asWebviewUri(vscode.Uri.joinPath(distBase, 'styles.css'));
    const scriptUriDist = webview.asWebviewUri(vscode.Uri.joinPath(distBase, 'main.js'));
    const ansiParserUriDist = webview.asWebviewUri(vscode.Uri.joinPath(distBase, 'ansiParser.js'));

    const styleUriSrc = webview.asWebviewUri(vscode.Uri.joinPath(srcBase, 'styles.css'));
    const scriptUriSrc = webview.asWebviewUri(vscode.Uri.joinPath(srcBase, 'main.js'));
    const ansiParserUriSrc = webview.asWebviewUri(vscode.Uri.joinPath(srcBase, 'ansiParser.js'));

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <link href="${styleUriDist}" rel="stylesheet">
  <link href="${styleUriSrc}" rel="stylesheet">
  <title>Script Runner</title>
</head>
<body>
  <div id="app">
    <header id="toolbar">
      <div class="toolbar-left">
        <svg class="toolbar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        <h1>Script Runner</h1>
      </div>
      <div class="toolbar-right">
        <div class="search-container">
          <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          <input type="text" id="search-input" placeholder="Filter scripts..." />
        </div>
        <button id="refresh-btn" class="icon-btn" title="Refresh scripts">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
        </button>
      </div>
    </header>
    <main id="scripts-container">
      <div id="loading-state" class="state-message">
        <div class="loading-spinner"></div>
        <p>Loading scripts...</p>
      </div>
      <div id="empty-state" class="state-message hidden">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48" opacity="0.4"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>
        <p>No scripts found in workspace</p>
      </div>
      <div id="no-results-state" class="state-message hidden">
        <p>No scripts match your filter</p>
      </div>
      <div id="script-cards"></div>
    </main>
  </div>
  <script nonce="${nonce}" src="${ansiParserUriDist}"></script>
  <script nonce="${nonce}" src="${ansiParserUriSrc}"></script>
  <script nonce="${nonce}" src="${scriptUriDist}"></script>
  <script nonce="${nonce}" src="${scriptUriSrc}"></script>
</body>
</html>`;
  }

  public dispose(): void {
    ScriptRunnerPanel.currentPanel = undefined;
    this._executor.stopAll();
    this._panel.dispose();
    for (const d of this._disposables) {
      d.dispose();
    }
    this._disposables = [];
  }
}

function getNonce(): string {
  let text = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}
