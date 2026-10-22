import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const root = new URL('../surfaces/02/', import.meta.url);
const source = name => fs.readFileSync(new URL(name, root), 'utf8');
test('PWA file vault and integration scripts parse', () => {
 for (const name of ['app.js', 'file-vault.js']) new vm.Script(source(name));
 const html = source('index.html');
 assert.match(html, /id="filePicker" type="file" multiple hidden/);
 assert.ok(html.indexOf('file-vault.js') < html.indexOf('app.js'));
 assert.match(source('app.js'), /MondayFiles\.add/);
 assert.match(source('sw.js'), /file-vault\.js/);
});
