/**
 * @license
 * Copyright 2026 Oliver Moran <oliver.moran@gmail.com>
 * This source code is licensed under the MIT license found in the
 * LICENSE file at https://github.com/oliver-moran/llaminate
 */

/// <reference path="./llaminate.d.ts" />

// @ts-ignore This will be replaced with a minified version in the buildprocess
const { version: LLAMINATE_VERSION } = require("./build-info.json");

interface ChatTarget {
    readonly config: LlaminateConfig;
    clear(messages?: LlaminateMessage[]): void;
    export(window?: number): LlaminateMessage[];
    complete(prompt: string | LlaminateMessage[], config?: LlaminateConfig): Promise<LlaminateResponse>;
    stream(prompt: string | LlaminateMessage[], config?: LlaminateConfig): AsyncGenerator<LlaminateResponse>;
}

interface ChatStreams {
    input?: NodeJS.ReadStream;
    output?: NodeJS.WriteStream;
}

interface ChatIO {
    input: NodeJS.ReadStream;
    output: NodeJS.WriteStream;
    write?: (str: string) => boolean;
}

interface ChatState {
    session: AbortController;
    request: AbortController | null;
}

interface TranscriptEntry {
    id: number;
    user: string;
    assistant: string;
}

type MarkdownRendererFunction = (markdown: string) => string;

const ANSI = {
    reset: "\x1b[0m",
    boldWhite: "\x1b[1;37m",
    dimWhite: "\x1b[2;37m",
    white: "\x1b[37m",
    brightCyan: "\x1b[96m",
} as const;

let markdownRenderer: MarkdownRendererFunction | null = null;

const waitSpinnerFrames = [
    "⠋",
    "⠙",
    "⠹",
    "⠸",
    "⠼",
    "⠴",
    "⠦",
    "⠧",
    "⠇",
    "⠏",
] as const;

const llamina = `
     **#            
  +++++*            
    ++**            
    *+***           
   ===###+     --   
   +=%%++====*=--   
    ---+=====+====  
    ---@++**##+++   
     =***%%%#+++%   
      %**    @++    
      %#     %%#    `;

function ensureMarkdownRenderer(): void {
    if (markdownRenderer) return;

    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const markedModule: any = require("marked");
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const markedTerminalModule: any = require("marked-terminal");

        const marked = markedModule?.marked || markedModule?.default || markedModule;
        const markedTerminal = markedTerminalModule?.markedTerminal || markedTerminalModule?.default;

        if (marked?.use && markedTerminal) {
            marked.use(markedTerminal({
                reflowText: false,
                showSectionPrefix: false,
                emoji: true,
            }));

            markdownRenderer = (markdown: string): string => String(marked.parse(markdown));
        }
    } catch {
        // Fallback keeps raw text output when markdown renderer is unavailable.
    }
}

function renderMarkdown(text: string): string {
    if (!text) return "";

    try {
        return markdownRenderer ? markdownRenderer(text) : text;
    } catch {
        return text;
    }
}

function tintAssistantOutput(text: string): string {
    if (!text) return text;

    const resets = /\x1b\[(?:0|39)m/g;
    const tinted = text.trimEnd().replace(resets, match => `${match}${ANSI.brightCyan}`);
    return `${ANSI.brightCyan}${tinted}${ANSI.reset}`;
}

function writeOutput(io: ChatIO, state: ChatState, str: string): void {
    if (!state.session.signal.aborted) io.write?.(str);
}

function formatFooter(usage: Tokens): string {
    return `🎟️  ${usage.total} (⬆ ${usage.input} ⬇ ${usage.output})`;
}

function updateUsage(tokens: Tokens, response: LlaminateResponse): void {
    tokens.input += response.tokens?.input || 0;
    tokens.output += response.tokens?.output || 0;
    tokens.total += response.tokens?.total || 0;
}

function colorizeBannerArtLine(line: string, lineIndex: number, lineCount: number): string {
    if (lineCount <= 1) return `\x1b[38;2;255;80;255m${line}${ANSI.reset}`;

    const position = lineCount - 1 - lineIndex;
    const ratio = position / (lineCount - 1);
    const red = Math.round(80 + (255 - 80) * ratio);
    const blue = Math.round(80 + (255 - 80) * ratio);
    const green = Math.round(0 + (64 - 0) * ratio);
    return `\x1b[38;2;${red};${green};${blue}m${line}${ANSI.reset}`;
}

function printBanner(io: ChatIO, endpoint: string, model: string, name?: string): void {
    io.write?.(buildBanner(endpoint, model, name));
}

function buildBanner(endpoint: string, model: string, name?: string): string {
    const artLines = llamina.split("\n").slice(1);
    const artWidth = Math.max(...artLines.map(l => l.length));
    const padded = artLines.map(l => l.padEnd(artWidth));

    const versionLine = name 
        ? `${ANSI.boldWhite}Llaminate v${LLAMINATE_VERSION} (${name})${ANSI.reset}`
        : `${ANSI.boldWhite}Llaminate v${LLAMINATE_VERSION}${ANSI.reset}`;

    const info = [
        versionLine,
        `${ANSI.dimWhite}${endpoint}${ANSI.reset}`,
        `${ANSI.dimWhite}${model}${ANSI.reset}`,
    ];

    const offset = padded.length - info.length;
    const lines = padded.map((art, i) => {
        const text = info[i - offset];
        const artLine = colorizeBannerArtLine(art, i, padded.length);
        return text ? `${artLine}  ${text}` : artLine;
    });

    return `\n${lines.join("\n")}\n`;
}

async function importEsm(specifier: string): Promise<any> {
    return await Function("modulePath", "return import(modulePath);")(specifier);
}

async function runInkChat(
    target: ChatTarget,
    io: ChatIO,
    state: ChatState,
    local: LlaminateConfig,
    streamEnabled: boolean,
    callback: ResponseCallback | undefined,
    usage: Tokens): Promise<void> {
    const React = await importEsm("react");
    const Ink = await importEsm("ink");
    const h = React.createElement;
    const { useEffect, useRef, useState } = React;
    const { Box, Text, render, useApp, useInput } = Ink;
    const banner = buildBanner(target.config.endpoint, target.config.model, target.config.name);

    // Animated number component for smooth token counting
    const AnimatedNumber = ({ value }: { value: number }) => {
        const [displayed, setDisplayed] = useState(value);
        const animationRef = useRef(null as NodeJS.Timeout | null);
        const displayedRef = useRef(0 as number);

        useEffect(() => {
            displayedRef.current = displayed;
        }, [displayed]);

        useEffect(() => {
            const start = displayedRef.current;
            const end = value;
            const duration = 1000;

            if (animationRef.current) clearTimeout(animationRef.current);
            if (start === end) return;

            const startTime = Date.now();
            const animate = () => {
                const elapsed = Date.now() - startTime;
                const progress = Math.min(elapsed / duration, 1);
                const eased = 1 - Math.pow(1 - progress, 3);
                const current = Math.floor(start + (end - start) * eased);
                setDisplayed(current);
                if (progress < 1) animationRef.current = setTimeout(animate, 16);
            };
            animate();
            return () => { if (animationRef.current) clearTimeout(animationRef.current); };
        }, [value]);

        return displayed;
    };

    // Animated footer component
    const AnimatedFooter = ({ tokens }: { tokens: Tokens }) => {
        return h(Text, { color: "gray" },
            "🎟️  ",
            h(AnimatedNumber, { value: tokens.total }),
            " (⬆ ",
            h(AnimatedNumber, { value: tokens.input }),
            " ⬇ ",
            h(AnimatedNumber, { value: tokens.output }),
            ")");
    };

    await new Promise<void>((resolve, reject) => {
        let app: any;
        let settled = false;

        const finish = (error?: any): void => {
            if (settled) return;
            settled = true;
            if (error) reject(error);
            else resolve();
        };

        const App = (): any => {
            const { exit } = useApp();
            const [transcript, setTranscript] = useState([] as TranscriptEntry[]);
            const [inputValue, setInputValue] = useState("");
            const [activeQuestion, setActiveQuestion] = useState("");
            const [activeOutput, setActiveOutput] = useState("");
            const [busy, setBusy] = useState(false);
            const [isExiting, setIsExiting] = useState(false);
            const [spinnerFrame, setSpinnerFrame] = useState(0);
            const [typingCursorVisible, setTypingCursorVisible] = useState(true);
            const [cursorVisible, setCursorVisible] = useState(true);
            const [footer, setFooter] = useState({ ...usage } as Tokens);
            const requestRef = useRef(null as AbortController | null);
            const nextId = useRef(0);
            const mounted = useRef(true);

            const appendTurn = (user: string, assistant: string): void => {
                if (!mounted.current || (!user && !assistant)) return;

                setTranscript(items => items.concat({
                    id: nextId.current++,
                    user,
                    assistant,
                }));
            };

            const syncUsage = (response: LlaminateResponse): void => {
                setFooter(current => {
                    const next = { ...current };
                    updateUsage(next, response);
                    usage.input = next.input;
                    usage.output = next.output;
                    usage.total = next.total;
                    return next;
                });
            };

            const submit = async (question: string): Promise<void> => {
                if (busy || !question.trim()) return;

                setInputValue("");
                setActiveQuestion(question);
                setActiveOutput("");
                setBusy(true);
                setSpinnerFrame(0);

                state.request = new AbortController();
                requestRef.current = state.request;
                const requestConfig = {
                    ...local,
                    signal: state.request.signal,
                } as LlaminateConfig;

                let response = "";
                try {
                    if (!streamEnabled || callback) {
                        const completion = await target.complete(question, requestConfig);
                        response = callback ? await callback(completion) : completion?.message || "";
                        appendTurn(question, tintAssistantOutput(renderMarkdown(String(response).trim())));
                        syncUsage(completion);
                    } else {
                        const result = await target.stream(question, requestConfig);
                        response = "";
                        let start = true;
                        let delimit = false;
                        let hangover = "";

                        for await (const chunk of result) {
                            if (chunk.delta) {
                                let clean = chunk.delta.replace(/[\x1E\x04]+$/, "");

                                if ((start || delimit) && clean.trim() === "") continue;
                                else if (start || delimit) {
                                    clean = start ? clean.trimStart() : `\n\n${clean.trimStart()}`;
                                    start = false;
                                    delimit = false;
                                }

                                if (chunk.delta.endsWith("\x1E")) {
                                    clean = clean.trimEnd();
                                    delimit = true;
                                    hangover = "";
                                } else if (clean.trim() === "") {
                                    hangover += clean;
                                } else {
                                    const whitespace = clean.substring(clean.trimEnd().length);
                                    response += hangover + clean.trimEnd();
                                    hangover = whitespace;
                                    if (mounted.current) setActiveOutput(response);
                                }
                            }

                            if (chunk.tokens) syncUsage(chunk);
                        }

                        appendTurn(question, tintAssistantOutput(renderMarkdown(response.trim())));
                    }
                } catch (error: any) {
                    if (state.request?.signal.aborted || error?.name === "AbortError") {
                        const interrupted = response
                            ? `${ANSI.brightCyan}${response}${ANSI.reset}${ANSI.dimWhite}… 💣${ANSI.reset}`
                            : `${ANSI.dimWhite}… 💣${ANSI.reset}`;
                        appendTurn(question, interrupted);
                    } else {
                        finish(error);
                        app?.unmount?.();
                        return;
                    }
                } finally {
                    state.request = null;
                    requestRef.current = null;
                    if (mounted.current) {
                        setBusy(false);
                        setActiveQuestion("");
                        setActiveOutput("");
                        setSpinnerFrame(0);
                    }
                }
            };

            useEffect(() => {
                return () => {
                    mounted.current = false;
                    requestRef.current?.abort();
                };
            }, []);

            useEffect(() => {
                if (!busy || activeOutput) return;

                const timer = setInterval(() => {
                    if (mounted.current) setSpinnerFrame(frame => (frame + 1) % waitSpinnerFrames.length);
                }, 160);

                return () => clearInterval(timer);
            }, [busy, activeOutput]);

            useEffect(() => {
                if (!busy || !activeOutput) {
                    setTypingCursorVisible(true);
                    return;
                }

                const timer = setInterval(() => {
                    if (mounted.current) setTypingCursorVisible(visible => !visible);
                }, 220);

                return () => clearInterval(timer);
            }, [busy, activeOutput]);

            useEffect(() => {
                if (busy) {
                    setCursorVisible(false);
                    return;
                }

                const timer = setInterval(() => {
                    if (mounted.current) setCursorVisible(visible => !visible);
                }, 500);

                return () => clearInterval(timer);
            }, [busy]);

            useEffect(() => {
                if (!isExiting) return;

                const timer = setTimeout(() => {
                    state.session.abort();
                    exit();
                }, 0);

                return () => clearTimeout(timer);
            }, [isExiting]);

            useInput((input: string, key: any) => {
                if (key.ctrl && input === "c") {
                    if (requestRef.current && !requestRef.current.signal.aborted) {
                        requestRef.current.abort();
                        return;
                    }

                    setInputValue("");
                    setActiveQuestion("");
                    setActiveOutput("");
                    setIsExiting(true);
                    return;
                }

                if (isExiting) return;
                if (busy) return;

                if (key.return) {
                    void submit(inputValue);
                    return;
                }

                if (key.backspace || key.delete) {
                    setInputValue(value => value.slice(0, -1));
                    return;
                }

                if (key.ctrl && input === "u") {
                    setInputValue("");
                    return;
                }

                if (key.ctrl || key.meta) return;

                const printable = input.replace(/[\r\n]/g, "");
                if (printable) setInputValue(value => value + printable);
            });

            const renderActiveOutput = (): any => {
                if (!activeOutput) return h(Text, { color: "magentaBright" }, waitSpinnerFrames[spinnerFrame]);

                return h(Text, { color: "cyanBright" },
                    activeOutput,
                    h(Text, { color: "magentaBright" }, typingCursorVisible ? "▁" : " "));
            };

            if (isExiting) return null;

            return h(Box, { flexDirection: "column" },
                h(Text, null, banner),
                transcript.map((item: TranscriptEntry) => h(Box, {
                    key: item.id,
                    flexDirection: "column",
                    marginBottom: 1,
                },
                    h(Text, { color: "white" }, item.user || " "),
                    h(Box, { height: 1 }, h(Text, null, " ")),
                    h(Text, null, item.assistant || " "))),
                busy
                    ? h(Box, {
                        marginBottom: 1,
                        flexDirection: "column",
                      },
                        h(Text, { color: "white" }, activeQuestion),
                        h(Box, { height: 1 }, h(Text, null, " ")),
                        renderActiveOutput())
                    : h(Box, { marginBottom: 1 }, h(Text, { color: "white" }, `${inputValue}${cursorVisible ? "█" : " "}`)),
                h(AnimatedFooter, { tokens: footer }));
        };

        app = render(h(App), {
            exitOnCtrlC: false,
            stdin: io.input,
            stdout: io.output,
        });

        app.waitUntilExit().then(() => finish(), finish);
    });
}

/**
 * Starts an interactive terminal chat session for a Llaminate instance.
 */
export async function chat(
    target: ChatTarget,
    config?: LlaminateConfig,
    callback?: ResponseCallback,
    streams?: ChatStreams): Promise<void> {
    ensureMarkdownRenderer();

    const local = { ...(config || {}) } as LlaminateConfig;
    const input = local.input || streams?.input || process.stdin;
    const output = local.output || streams?.output || process.stdout;
    delete local.input;
    delete local.output;

    if (local.history) {
        target.clear(local.history);
        delete local.history;
    }

    const io: ChatIO = {
        input,
        output,
        write: output?.write?.bind(output)
    };

    const state: ChatState = {
        session: new AbortController(),
        request: null,
    };

    const usage: Tokens = { input: 0, output: 0, total: 0 };
    const streamEnabled = (local.options?.stream ?? target.config?.options?.stream ?? true) !== false;

    try {
        if (io.output.isTTY) await runInkChat(target, io, state, local, streamEnabled, callback, usage);
        else printBanner(io, target.config.endpoint, target.config.model, target.config.name);
    } finally {
        state.request?.abort();
    }
}
