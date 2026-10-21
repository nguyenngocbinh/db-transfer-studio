import * as vscode from 'vscode';
import { createAdapter } from './db';
import { DbConfig, DbAdapter } from './types';
import { exportQuery } from './transfer/export';
import { importFile, previewFile } from './transfer/import';

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(vscode.commands.registerCommand('dbTransferStudio.open', () => openPanel(context)));
}

function openPanel(context: vscode.ExtensionContext): void {
  const panel = vscode.window.createWebviewPanel('dbTransferStudio', 'DB Transfer Studio', vscode.ViewColumn.Active, {
    enableScripts: true,
    retainContextWhenHidden: true
  });
  panel.webview.html = getHtml(panel.webview);
  let adapter: DbAdapter | undefined;

  panel.webview.onDidReceiveMessage(async message => {
    const send = (type: string, payload: Record<string, unknown> = {}) => panel.webview.postMessage({ type, ...payload });
    try {
      if (message.command === 'connect') {
        await adapter?.close();
        const config: DbConfig = {
          kind: message.kind,
          server: String(message.server ?? ''),
          database: String(message.database ?? ''),
          user: String(message.user ?? ''),
          password: String(message.password ?? ''),
          port: Number(message.port) || undefined,
          encrypt: Boolean(message.encrypt),
          trustServerCertificate: Boolean(message.trustServerCertificate)
        };
        adapter = createAdapter(config);
        await adapter.connect();
        const schemas = await adapter.listSchemas();
        send('connected', { schemas, message: 'Kết nối database thành công.' });
      } else if (message.command === 'previewQuery') {
        if (!adapter) throw new Error('Hãy kết nối database trước.');
        send('preview', { result: await adapter.preview(String(message.query ?? ''), 100) });
      } else if (message.command === 'export') {
        if (!adapter) throw new Error('Hãy kết nối database trước.');
        const format = message.format === 'xlsx' ? 'xlsx' : 'parquet';
        const uri = await vscode.window.showSaveDialog({ saveLabel: 'Export', filters: format === 'xlsx' ? { Excel: ['xlsx'] } : { Parquet: ['parquet'] } });
        if (!uri) return;
        const batchSize = vscode.workspace.getConfiguration('dbTransferStudio').get<number>('batchSize', 2000);
        const count = await exportQuery(adapter, String(message.query ?? ''), uri.fsPath, format, batchSize, n => send('progress', { count: n, message: 'Đang export...' }));
        send('done', { message: `Export hoàn tất: ${count.toLocaleString()} dòng.`, path: uri.fsPath });
      } else if (message.command === 'pickImport') {
        const uris = await vscode.window.showOpenDialog({ canSelectMany: false, filters: { 'Excel / Parquet': ['xlsx', 'parquet'] } });
        if (!uris?.[0]) return;
        const preview = await previewFile(uris[0].fsPath, 100);
        send('filePreview', { path: uris[0].fsPath, preview });
      } else if (message.command === 'import') {
        if (!adapter) throw new Error('Hãy kết nối database trước.');
        const filePath = String(message.path ?? '');
        const schema = String(message.schema ?? '');
        const table = String(message.table ?? '');
        const columns = Array.isArray(message.columns) ? message.columns.map(String) : [];
        if (!filePath || !schema || !table || !columns.length) throw new Error('Thiếu file, schema, table hoặc mapping cột.');
        const confirm = await vscode.window.showWarningMessage(`Ghi dữ liệu vào ${schema}.${table}? Kiểm tra target trước khi tiếp tục.`, { modal: true }, 'Import');
        if (confirm !== 'Import') return;
        const batchSize = vscode.workspace.getConfiguration('dbTransferStudio').get<number>('batchSize', 2000);
        const count = await importFile(adapter, filePath, schema, table, columns, batchSize, n => send('progress', { count: n, message: 'Đang import...' }));
        send('done', { message: `Import hoàn tất: ${count.toLocaleString()} dòng.` });
      } else if (message.command === 'disconnect') {
        await adapter?.close(); adapter = undefined; send('status', { message: 'Đã ngắt kết nối.' });
      }
    } catch (error) {
      send('error', { message: error instanceof Error ? error.message : String(error) });
    }
  });
  panel.onDidDispose(() => { void adapter?.close(); });
}

function getHtml(webview: vscode.Webview): string {
  const nonce = String(Date.now());
  return `<!doctype html><html lang="vi"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
body{font-family:var(--vscode-font-family);color:var(--vscode-foreground);padding:20px;max-width:1000px;margin:auto}
h1{font-size:24px}.muted{color:var(--vscode-descriptionForeground)}.grid{display:grid;grid-template-columns:repeat(2,minmax(200px,1fr));gap:12px}
.card{border:1px solid var(--vscode-panel-border);border-radius:8px;padding:16px;margin:16px 0}
label{display:block;font-size:12px;margin:8px 0 4px}input,select,textarea{box-sizing:border-box;width:100%;padding:8px;color:var(--vscode-input-foreground);background:var(--vscode-input-background);border:1px solid var(--vscode-input-border);border-radius:4px}
button{padding:8px 12px;margin:8px 6px 0 0;background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:0;border-radius:4px;cursor:pointer}
pre{white-space:pre-wrap;overflow:auto}table{border-collapse:collapse;width:100%;display:block;overflow:auto}td,th{border:1px solid var(--vscode-panel-border);padding:6px;text-align:left}
#status{margin-top:12px;white-space:pre-wrap}@media(max-width:600px){.grid{grid-template-columns:1fr}}
</style></head><body>
<h1>DB Transfer Studio</h1><p class="muted">SQL Server / IBM Db2 · Excel / Parquet · Import / Export</p>
<section class="card"><h2>1. Kết nối database</h2><div class="grid">
<div><label>Database engine</label><select id="kind"><option value="sqlserver">SQL Server</option><option value="db2">IBM Db2</option></select></div>
<div><label>Server / Host</label><input id="server" placeholder="hostname hoặc localhost"></div>
<div><label>Database</label><input id="database" placeholder="database/catalog"></div><div><label>Port</label><input id="port" type="number" placeholder="1433 / 50000"></div>
<div><label>User</label><input id="user" autocomplete="username"></div><div><label>Password</label><input id="password" type="password" autocomplete="current-password"></div>
</div><button id="connect">Connect</button><button id="disconnect">Disconnect</button><div id="schemas"></div></section>
<section class="card"><h2>2. Export query</h2><label>SQL SELECT query</label><textarea id="query" rows="4" placeholder="SELECT * FROM dbo.YourTable"></textarea>
<button id="previewQuery">Preview 100 rows</button><button id="exportXlsx">Export Excel</button><button id="exportParquet">Export Parquet</button><div id="queryPreview"></div></section>
<section class="card"><h2>3. Import file</h2><button id="pickFile">Choose Excel / Parquet and preview</button><div id="fileInfo"></div>
<div class="grid"><div><label>Target schema</label><input id="targetSchema" placeholder="dbo"></div><div><label>Target table</label><input id="targetTable" placeholder="TARGET_TABLE"></div></div>
<label>Column mapping (comma-separated, target names must match file headers)</label><input id="columns" placeholder="CUSTOMER_ID, PROCESS_DATE, EAD"><button id="import">Import selected columns</button></section>
<section class="card"><h2>Activity</h2><div id="status">Chưa kết nối. Không giả lập trạng thái kết nối.</div></section>
<script nonce="${nonce}">
const vscode=acquireVsCodeApi();let importPath='';const $=id=>document.getElementById(id);
const send=(command,extra={})=>vscode.postMessage({command,...extra});
const esc=v=>String(v??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function render(target,result){const cols=(result.columns||[]).map(c=>typeof c==='string'?c:c.name);let html='<p>Preview: '+(result.rows||[]).length+' dòng</p><table><thead><tr>'+cols.map(c=>'<th>'+esc(c)+'</th>').join('')+'</tr></thead><tbody>';for(const row of (result.rows||[]).slice(0,20))html+='<tr>'+cols.map(c=>'<td>'+esc(row[c])+'</td>').join('')+'</tr>';$(target).innerHTML=html+'</tbody></table>'}
$('connect').onclick=()=>{\n  const server=$('server').value.trim(), database=$('database').value.trim(), user=$('user').value.trim();\n  if(!server||!database||!user){$('status').textContent='Vui lòng nhập Server / Host, Database và User trước khi kết nối.';return;}\n  $('connect').disabled=true;$('connect').textContent='Đang kết nối...';$('status').textContent='Đang gửi yêu cầu kết nối SQL Server...';\n  send('connect',{kind:$('kind').value,server,database,port:$('port').value,user,password:$('password').value,trustServerCertificate:true});\n};
$('disconnect').onclick=()=>send('disconnect');$('previewQuery').onclick=()=>send('previewQuery',{query:$('query').value});
$('exportXlsx').onclick=()=>send('export',{query:$('query').value,format:'xlsx'});$('exportParquet').onclick=()=>send('export',{query:$('query').value,format:'parquet'});
$('pickFile').onclick=()=>send('pickImport');$('import').onclick=()=>send('import',{path:importPath,schema:$('targetSchema').value,table:$('targetTable').value,columns:$('columns').value.split(',').map(x=>x.trim()).filter(Boolean)});
window.addEventListener('message',event=>{const m=event.data;
if(m.type==='connected'){$('connect').disabled=false;$('connect').textContent='Connect';$('schemas').textContent='Schemas: '+m.schemas.join(', ');$('status').textContent=m.message}
if(m.type==='preview')render('queryPreview',m.result);
if(m.type==='filePreview'){importPath=m.path;$('fileInfo').textContent='File: '+m.path+' | Preview '+m.preview.totalPreviewRows+' rows';$('columns').value=m.preview.columns.join(',');render('fileInfo',m.preview)}
if(m.type==='progress')$('status').textContent=m.message+' '+Number(m.count||0).toLocaleString()+' dòng';
if(m.type==='done')$('status').textContent=m.message+(m.path?'\n'+m.path:'');if(m.type==='error')$('status').textContent='LỖI: '+m.message;if(m.type==='status')$('status').textContent=m.message;
});
</script></body></html>`;
}

export function deactivate(): void {}
