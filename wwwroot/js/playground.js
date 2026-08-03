window.loomPlayground = (() => {
  let sourceEditor = null;
  let outputEditor = null;
  let loadPromise = null;

  let sourceChangeSubscription = null;
  let compileTimer = null;
  let dotNetReference = null;

  const compileDelayMilliseconds = 400;

  function getEditorTheme() {
    return document.documentElement.dataset.theme === "dark" ? "vs-dark" : "vs";
  }

  function setTheme(theme) {
    if (typeof monaco === "undefined") {
      return;
    }

    monaco.editor.setTheme(theme === "dark" ? "vs-dark" : "vs");
  }

  function loadMonaco() {
    if (loadPromise) {
      return loadPromise;
    }

    loadPromise = new Promise((resolve, reject) => {
      if (typeof require === "undefined") {
        reject(new Error("Monaco loader was not loaded."));
        return;
      }

      require.config({
        paths: {
          vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs",
        },
      });

      require(["vs/editor/editor.main"], () => {
        registerLoomLanguage();
        resolve();
      }, reject);
    });

    return loadPromise;
  }

  function registerLoomLanguage() {
    if (
      monaco.languages.getLanguages().some((language) => language.id === "loom")
    ) {
      return;
    }

    monaco.languages.register({
      id: "loom",
      extensions: [".loom"],
      aliases: ["Loom", "loom"],
    });

    monaco.languages.setLanguageConfiguration("loom", {
      comments: {
        lineComment: "##",
        blockComment: ["#:", ":#"],
      },

      brackets: [
        ["{", "}"],
        ["[", "]"],
        ["(", ")"],
      ],

      autoClosingPairs: [
        { open: "{", close: "}" },
        { open: "[", close: "]" },
        { open: "(", close: ")" },
        { open: '"', close: '"' },
        { open: "'", close: "'" },
      ],

      surroundingPairs: [
        { open: "{", close: "}" },
        { open: "[", close: "]" },
        { open: "(", close: ")" },
        { open: '"', close: '"' },
        { open: "'", close: "'" },
      ],
    });

    monaco.languages.setMonarchTokensProvider("loom", {
      defaultToken: "",
      tokenPostfix: ".loom",

      keywords: [
        "declare",
        "nameof",
        "keyof",
        "typeof",
        "enum",
        "type",
        "implement",
        "interface",
        "trait",
        "as",
        "let",
        "mut",
        "new",
        "is",
        "not",
        "when",
        "match",
      ],

      controlKeywords: [
        "if",
        "else",
        "while",
        "for",
        "after",
        "every",
        "defer",
        "break",
        "continue",
        "return",
      ],

      primitiveTypes: [
        "number",
        "string",
        "bool",
        "never",
        "unknown",
        "void",
        "none",
      ],

      operators: [
        "=",
        "+=",
        "-=",
        "*=",
        "/=",
        "%=",
        "^=",
        "~=",
        "&=",
        "|=",
        "<<=",
        ">>=",
        ">>>=",
        "&&=",
        "||=",
        "??=",
        "//=",

        "==",
        "!=",
        "<",
        ">",
        "<=",
        ">=",

        "+",
        "-",
        "*",
        "/",
        "//",
        "%",
        "^",
        "~",
        "&",
        "|",

        "!",
        "&&",
        "||",
        "?",
        ":",
        "..",
        "::<",
      ],

      symbols: /[=><!~?:&|+\-*\/%^]+/,

      tokenizer: {
        root: [
          [/##.*$/, "comment"],
          [/#:/, { token: "comment", next: "@comment" }],

          [
            /\b(enum)(\s+)([A-Z][A-Za-z0-9_]*)/,
            ["keyword", "", "type.identifier"],
          ],

          [
            /\b(type)(\s+)([_a-zA-Z][_a-zA-Z0-9]*)/,
            ["keyword", "", "type.identifier"],
          ],

          [
            /\b(fn|event)(\s+)([_a-zA-Z][_a-zA-Z0-9]*)/,
            ["keyword", "", "function"],
          ],

          [/\b[_a-zA-Z][_a-zA-Z0-9]*\b(?=\s*!?\()/, "function"],

          [/\b[_a-zA-Z][_a-zA-Z0-9]*\b(?=\s*::<)/, "function"],

          [
            /\b(0[bB][01_]+|0[xX][0-9a-fA-F_]+|0[oO][0-7_]+|(\d|_)+(\.(\d|_)+)?([eE][+\-]?\d+)?[hH]?[mM]?[sS]?[mMsS]?[hHzZs]?)\b/,
            "number",
          ],

          [/\$"/, { token: "string.quote", next: "@interpstring" }],
          [/"/, { token: "string.quote", next: "@string" }],
          [/'/, { token: "string.quote", next: "@sstring" }],

          [/\b(true|false)\b/, "keyword"],

          [/\bnone\b/, "constant"],

          [/\b[A-Z][a-zA-Z0-9_]*\b/, "constant"],

          [/\b[A-Z_][A-Za-z0-9_]*\b/, "type.identifier"],

          [
            /\b[a-zA-Z_][a-zA-Z0-9_]*\b/,
            {
              cases: {
                "@controlKeywords": "keyword",
                "@keywords": "keyword",
                "@primitiveTypes": "type",
                "@default": "identifier",
              },
            },
          ],

          [/[{}()\[\]]/, "@brackets"],

          [/[;,]/, "delimiter"],
          [/\./, "delimiter"],

          [
            /@symbols/,
            {
              cases: {
                "@operators": "operator",
                "@default": "",
              },
            },
          ],
        ],

        comment: [
          [/.*?:#/, { token: "comment", next: "@pop" }],
          [/./, "comment"],
        ],

        string: [
          [/[^\\"]+/, "string"],
          [/\\./, "string.escape"],
          [/"/, { token: "string.quote", next: "@pop" }],
        ],

        sstring: [
          [/[^\\']+/, "string"],
          [/\\./, "string.escape"],
          [/'/, { token: "string.quote", next: "@pop" }],
        ],

        interpstring: [
          [/[^\\{"}]+/, "string"],
          [/\\./, "string.escape"],

          [/\{/, { token: "delimiter.bracket", next: "@interpolation" }],

          [/"/, { token: "string.quote", next: "@pop" }],
        ],

        interpolation: [
          [/\{/, "delimiter.bracket", "@push"],

          [/\}/, { token: "delimiter.bracket", next: "@pop" }],

          { include: "root" },
        ],
      },
    });
  }

  async function initialize(
    sourceElementId,
    outputElementId,
    initialSource,
    callbackReference,
  ) {
    await loadMonaco();

    dispose();

    const sourceElement = document.getElementById(sourceElementId);

    const outputElement = document.getElementById(outputElementId);

    if (!sourceElement || !outputElement) {
      throw new Error("Playground editor elements were not found.");
    }

    dotNetReference = callbackReference;

    sourceEditor = monaco.editor.create(sourceElement, {
      value: initialSource,
      language: "loom",
      theme: getEditorTheme(),
      automaticLayout: true,

      minimap: {
        enabled: false,
      },

      fontSize: 14,
      tabSize: 4,
      insertSpaces: true,
      scrollBeyondLastLine: false,
      ariaLabel: "Loom source editor",
    });

    outputEditor = monaco.editor.create(outputElement, {
      value: "-- Compiled Luau will appear here.",
      language: "lua",
      theme: getEditorTheme(),
      automaticLayout: true,

      minimap: {
        enabled: false,
      },

      fontSize: 14,
      readOnly: true,
      scrollBeyondLastLine: false,
      ariaLabel: "Generated Luau output",
    });

    sourceChangeSubscription = sourceEditor.onDidChangeModelContent(() => {
      scheduleCompilation();
    });
  }

  function scheduleCompilation() {
    window.clearTimeout(compileTimer);

    compileTimer = window.setTimeout(async () => {
      compileTimer = null;

      if (!sourceEditor || !dotNetReference) {
        return;
      }

      const source = sourceEditor.getValue();

      try {
        await dotNetReference.invokeMethodAsync("SourceChangedAsync", source);
      } catch (error) {
        /*
         * Navigation or component disposal can invalidate the
         * DotNetObjectReference while a delayed callback is pending.
         */
        if (dotNetReference) {
          console.error("Automatic Loom compilation failed.", error);
        }
      }
    }, compileDelayMilliseconds);
  }

  function getSource() {
    return sourceEditor?.getValue() ?? "";
  }

  function setOutput(value) {
    outputEditor?.setValue(value ?? "");
  }

  function setDiagnostics(diagnostics) {
    if (!sourceEditor) {
      return;
    }

    const model = sourceEditor.getModel();

    if (!model) {
      return;
    }

    const markers = (diagnostics ?? []).map((diagnostic) => ({
      startLineNumber: Math.max(diagnostic.startLineNumber, 1),

      startColumn: Math.max(diagnostic.startColumn, 1),

      endLineNumber: Math.max(
        diagnostic.endLineNumber,
        diagnostic.startLineNumber,
        1,
      ),

      endColumn: Math.max(diagnostic.endColumn, diagnostic.startColumn + 1, 2),

      message: diagnostic.message,
      code: diagnostic.code ?? undefined,
      severity: toMonacoSeverity(diagnostic.severity),
    }));

    monaco.editor.setModelMarkers(model, "loom", markers);
  }

  function toMonacoSeverity(severity) {
    switch (severity) {
      case "error":
        return monaco.MarkerSeverity.Error;

      case "warning":
        return monaco.MarkerSeverity.Warning;

      case "info":
        return monaco.MarkerSeverity.Info;

      default:
        return monaco.MarkerSeverity.Hint;
    }
  }

  function dispose() {
    window.clearTimeout(compileTimer);

    sourceChangeSubscription?.dispose();
    sourceEditor?.dispose();
    outputEditor?.dispose();

    sourceChangeSubscription = null;
    sourceEditor = null;
    outputEditor = null;
    dotNetReference = null;
    compileTimer = null;
  }

  return {
    initialize,
    getSource,
    setOutput,
    setDiagnostics,
    setTheme,
    dispose,
  };
})();
