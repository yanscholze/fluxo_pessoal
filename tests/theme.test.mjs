import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const lightTheme = css.slice(css.indexOf(".app-shell {"), css.indexOf('.app-shell[data-theme="dark"]'));
const darkTheme = css.slice(css.indexOf('.app-shell[data-theme="dark"]'));

test("modo claro usa branco puro como fundo e superfície", () => {
  assert.match(lightTheme, /--bg:\s*#ffffff/);
  assert.match(lightTheme, /--surface:\s*#ffffff/);
});

test("modo escuro preserva a paleta aprovada", () => {
  assert.match(darkTheme, /--bg:\s*#0b1118/);
  assert.match(darkTheme, /--surface:\s*#121b24/);
});
