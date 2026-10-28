// Minimal stand-in for monaco-editor's API, aliased in by monacoCodeEditor.test.js.
// It models just what MonacoCodeEditor relies on: models, cursors, flushes.

export const calls = { flushes: 0, executeEdits: 0, remeasureFonts: 0 };
export const editors = [];

function lineStarts(text) {
  const starts = [0];
  for (let index = 0; index < text.length; index += 1) if (text[index] === '\n') starts.push(index + 1);
  return starts;
}

export class Selection {
  constructor(startLineNumber, startColumn, endLineNumber, endColumn) {
    Object.assign(this, { startLineNumber, startColumn, endLineNumber, endColumn });
  }

  getPosition() {
    return { lineNumber: this.endLineNumber, column: this.endColumn };
  }
}

class FakeModel {
  constructor(text) {
    this.text = text;
    this.listeners = new Set();
    this.version = 1;
  }

  getValue() { return this.text; }
  getVersionId() { return this.version; }

  getPositionAt(offset) {
    const safe = Math.max(0, Math.min(offset, this.text.length));
    const starts = lineStarts(this.text);
    let line = 0;
    while (line + 1 < starts.length && starts[line + 1] <= safe) line += 1;
    return { lineNumber: line + 1, column: safe - starts[line] + 1 };
  }

  validatePosition(position) {
    const lines = this.text.split('\n');
    const lineNumber = Math.max(1, Math.min(position.lineNumber, lines.length));
    const column = Math.max(1, Math.min(position.column, lines[lineNumber - 1].length + 1));
    return { lineNumber, column };
  }

  getFullModelRange() {
    const lines = this.text.split('\n');
    return { startLineNumber: 1, startColumn: 1, endLineNumber: lines.length, endColumn: lines.at(-1).length + 1 };
  }

  replace(text, flush) {
    this.text = text;
    this.version += 1;
    this.listeners.forEach((listener) => listener({ isFlush: flush }));
  }

  setValue(text) {
    calls.flushes += 1;
    this.replace(text, true);
  }

  dispose() { this.listeners.clear(); }
}

class FakeEditor {
  constructor(node, options) {
    this.node = node;
    this.options = { ...options };
    this.model = null;
    this.position = { lineNumber: 1, column: 1 };
    this.focused = false;
    this.contentListeners = new Set();
    this.setModel(options.model);
  }

  getRawOptions() { return this.options; }
  updateOptions(options) { Object.assign(this.options, options); }
  getDomNode() { return this.node; }
  getModel() { return this.model; }

  setModel(model) {
    this.modelListener && this.model?.listeners.delete(this.modelListener);
    this.model = model;
    if (!model) return;
    this.modelListener = (event) => {
      // Like Monaco: a flush (setValue) throws the cursor back to (1,1).
      if (event.isFlush) this.position = { lineNumber: 1, column: 1 };
      this.contentListeners.forEach((listener) => listener(event));
    };
    model.listeners.add(this.modelListener);
  }

  getValue() { return this.model?.getValue() ?? ''; }
  getPosition() { return this.position; }
  setPosition(position) { this.position = position; }
  setSelection(selection) { this.selection = selection; this.position = selection.getPosition(); }
  saveViewState() { return { position: this.position }; }
  restoreViewState(state) { if (state?.position) this.position = state.position; }
  setScrollTop() {}
  setScrollLeft() {}
  layout() {}
  focus() { this.focused = true; }
  hasTextFocus() { return this.focused; }
  revealPositionInCenterIfOutsideViewport() {}
  pushUndoStop() {}
  trigger() {}
  getAction() { return null; }
  addAction() { return { dispose() {} }; }

  executeEdits(source, edits, cursorStateComputer) {
    if (this.options.readOnly) return false;
    calls.executeEdits += 1;
    this.model.replace(edits[0].text, false);
    const [selection] = cursorStateComputer?.() || [];
    if (selection) this.position = selection.getPosition();
    return true;
  }

  // Test helper: the user types at the caret.
  type(text) {
    const value = this.model.getValue();
    const lines = value.split('\n');
    const { lineNumber, column } = this.position;
    let offset = column - 1;
    for (let index = 0; index < lineNumber - 1; index += 1) offset += lines[index].length + 1;
    this.model.replace(`${value.slice(0, offset)}${text}${value.slice(offset)}`, false);
    this.position = this.model.getPositionAt(offset + text.length);
  }

  onDidChangeModelContent(listener) {
    this.contentListeners.add(listener);
    return { dispose: () => this.contentListeners.delete(listener) };
  }

  onDidFocusEditorText() { return { dispose() {} }; }
  onDidFocusEditorWidget() { return { dispose() {} }; }
  onDidAttemptReadOnlyEdit() { return { dispose() {} }; }
  onDidType() { return { dispose() {} }; }
  dispose() { this.disposed = true; }
}

export const editor = {
  create(node, options) {
    const instance = new FakeEditor(node, options);
    editors.push(instance);
    return instance;
  },
  createModel: (text) => new FakeModel(text),
  setModelLanguage() {},
  setTheme() {},
  defineTheme() {},
  remeasureFonts() { calls.remeasureFonts += 1; },
};

export const languages = {
  CompletionItemKind: {},
  registerCompletionItemProvider: () => ({ dispose() {} }),
  registerSignatureHelpProvider: () => ({ dispose() {} }),
};

export const KeyMod = { Alt: 0 };
export const KeyCode = { Enter: 0 };

export default class FakeWorker {}
