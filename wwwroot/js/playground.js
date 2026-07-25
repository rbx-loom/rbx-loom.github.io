window.loomPlayground = (() => {
    let sourceEditor = null;
    let outputEditor = null;
    let loadPromise = null;

    function getEditorTheme() {
        return document.documentElement.dataset.theme === "dark"
            ? "vs-dark"
            : "vs";
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
                    vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs"
                }
            });

            require(
                ["vs/editor/editor.main"],
                () => {
                    registerLoomLanguage();
                    resolve();
                },
                reject
            );
        });

        return loadPromise;
    }

    function registerLoomLanguage() {
        if (
            monaco.languages
                .getLanguages()
                .some(language => language.id === "loom")
        ) {
            return;
        }

        monaco.languages.register({
            id: "loom",
            extensions: [".loom"],
            aliases: ["Loom", "loom"]
        });

        monaco.languages.setLanguageConfiguration("loom", {
            comments: {
                lineComment: "//",
                blockComment: ["/*", "*/"]
            },

            brackets: [
                ["{", "}"],
                ["[", "]"],
                ["(", ")"]
            ],

            autoClosingPairs: [
                { open: "{", close: "}" },
                { open: "[", close: "]" },
                { open: "(", close: ")" },
                { open: "\"", close: "\"" },
                { open: "'", close: "'" }
            ],

            surroundingPairs: [
                { open: "{", close: "}" },
                { open: "[", close: "]" },
                { open: "(", close: ")" },
                { open: "\"", close: "\"" },
                { open: "'", close: "'" }
            ]
        });

        monaco.languages.setMonarchTokensProvider("loom", {
            keywords: [
                "let",
                "mut",
                "fn",
                "return",
                "if",
                "else",
                "while",
                "for",
                "in",
                "type",
                "interface",
                "sealed",
                "declare",
                "enum",
                "trait",
                "implement",
                "new",
                "after",
                "as",
                "keyof",
                "nameof"
            ],

            typeKeywords: [
                "bool",
                "number",
                "string",
                "void",
                "unknown",
                "none"
            ],

            literals: [
                "true",
                "false",
                "none"
            ],

            operators: [
                "=",
                ">",
                "<",
                "!",
                "~",
                "?",
                ":",
                "==",
                "<=",
                ">=",
                "!=",
                "&&",
                "||",
                "++",
                "--",
                "+",
                "-",
                "*",
                "/",
                "%",
                "&",
                "|",
                "^"
            ],

            tokenizer: {
                root: [
                    [
                        /[a-zA-Z_]\w*/,
                        {
                            cases: {
                                "@keywords": "keyword",
                                "@typeKeywords": "type",
                                "@literals": "constant",
                                "@default": "identifier"
                            }
                        }
                    ],

                    { include: "@whitespace" },

                    [/[{}()[\]]/, "@brackets"],
                    [/[<>](?!@symbols)/, "@brackets"],
                    [/@symbols/, "operator"],

                    [
                        /\d[\d_]*(\.\d[\d_]*)?([eE][+\-]?\d+)?\s*(ms|s|m|h|hz)?/,
                        "number"
                    ],

                    [/0[xX][0-9a-fA-F_]+/, "number.hex"],
                    [/0[bB][01_]+/, "number.binary"],
                    [/0[oO][0-7_]+/, "number.octal"],

                    [/[;,.]/, "delimiter"],

                    [/"([^"\\]|\\.)*$/, "string.invalid"],
                    [/"/, { token: "string.quote", next: "@string" }]
                ],

                whitespace: [
                    [/[ \t\r\n]+/, "white"],
                    [/\/\*/, "comment", "@comment"],
                    [/\/\/.*$/, "comment"]
                ],

                comment: [
                    [/[^/*]+/, "comment"],
                    [/\*\//, "comment", "@pop"],
                    [/[/*]/, "comment"]
                ],

                string: [
                    [/[^\\"]+/, "string"],
                    [/\\./, "string.escape"],
                    [/"/, { token: "string.quote", next: "@pop" }]
                ]
            },

            symbols: /[=><!~?:&|+\-*\/\^%]+/
        });
    }

    async function initialize(sourceElementId, outputElementId, initialSource) {
        await loadMonaco();

        dispose();

        const sourceElement = document.getElementById(sourceElementId);
        const outputElement = document.getElementById(outputElementId);

        if (!sourceElement || !outputElement) {
            throw new Error("Playground editor elements were not found.");
        }

        sourceEditor = monaco.editor.create(sourceElement, {
            value: initialSource,
            language: "loom",
            theme: getEditorTheme(),
            automaticLayout: true,
            minimap: {
                enabled: false
            },
            fontSize: 14,
            tabSize: 4,
            insertSpaces: true,
            scrollBeyondLastLine: false,
            ariaLabel: "Loom source editor"
        });

        outputEditor = monaco.editor.create(outputElement, {
            value: "-- Compiled Luau will appear here.",
            language: "lua",
            theme: getEditorTheme(),
            automaticLayout: true,
            minimap: {
                enabled: false
            },
            fontSize: 14,
            readOnly: true,
            scrollBeyondLastLine: false,
            ariaLabel: "Generated Luau output"
        });
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

        const markers = (diagnostics ?? []).map(diagnostic => ({
            startLineNumber: Math.max(diagnostic.startLineNumber, 1),
            startColumn: Math.max(diagnostic.startColumn, 1),
            endLineNumber: Math.max(
                diagnostic.endLineNumber,
                diagnostic.startLineNumber,
                1
            ),
            endColumn: Math.max(
                diagnostic.endColumn,
                diagnostic.startColumn + 1,
                2
            ),
            message: diagnostic.message,
            code: diagnostic.code ?? undefined,
            severity: toMonacoSeverity(diagnostic.severity)
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
        sourceEditor?.dispose();
        outputEditor?.dispose();

        sourceEditor = null;
        outputEditor = null;
    }

    return {
        initialize,
        getSource,
        setOutput,
        setDiagnostics,
        setTheme,
        dispose
    };
})();