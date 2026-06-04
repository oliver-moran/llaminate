// @ts-nocheck
/**
 * @projectname Llaminate CLI
 * @author Oliver Moran <oliver.moran@gmail.com>
 * @license
 * Copyright 2026 Oliver Moran <oliver.moran.github.com>
 * This source code is licensed under the MIT license found in the
 * LICENSE file at https://github.com/oliver-moran/llaminate
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
const { readFileSync } = fs;

// Get version from package.json
let packageVersion = '0.0.0';
try {
    // Try to find package.json relative to the module directory
    let packageJsonPath = path.resolve(process.cwd(), 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
        // Fallback: try parent directories
        let currentDir = process.cwd();
        for (let i = 0; i < 3; i++) {
            packageJsonPath = path.resolve(currentDir, 'package.json');
            if (fs.existsSync(packageJsonPath)) {
                break;
            }
            currentDir = path.dirname(currentDir);
        }
    }
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    packageVersion = packageJson.version || '0.0.0';
} catch {
    packageVersion = '0.0.0';
}

interface SetupResult {
    name: string;
    endpoint: string;
    apiKey: string;
    model: string;
    system?: string;
}

// ANSI color codes
const ANSI = {
    reset: "\x1b[0m",
    cyan: "\x1b[36m",
    white: "\x1b[37m",
    boldWhite: "\x1b[1;37m",
    gray: "\x1b[90m",
    bgMagenta: "\x1b[45m",
    underline: "\x1b[4m",
    bold: "\x1b[1m"
} as const;

/**
 * Dynamic import helper for ESM modules
 */
async function importEsm(specifier: string): Promise<any> {
    return await Function("modulePath", "return import(modulePath);")(specifier);
}

/**
 * Extracts a key name from an endpoint URL.
 */
function extractKeyNameFromEndpoint(endpoint: string): string {
    try {
        const url = new URL(endpoint);
        let hostname = url.hostname.replace(/^www\./, '');
        const parts = hostname.split('.');
        const mainDomain = parts[0];
        return mainDomain.toUpperCase();
    } catch {
        return 'API_KEY';
    }
}

/**
 * Validates that a string is a valid URL
 */
function isValidUrl(url: string): boolean {
    try {
        new URL(url);
        return true;
    } catch {
        return false;
    }
}

/**
 * Creates the .llaminate directory if it doesn't exist
 */
function ensureLlaminateDir(): string {
    const dir = path.join(os.homedir(), '.llaminate');
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
}

/**
 * Loads existing configurations from ~/.llaminate/config.yaml
 */
function loadExistingConfigs(): any[] {
    const yaml = require('js-yaml');
    const dir = path.join(os.homedir(), '.llaminate');
    const configPath = path.join(dir, 'config.yaml');
    
    if (!fs.existsSync(configPath)) {
        return [];
    }
    
    const content = fs.readFileSync(configPath, 'utf-8');
    const existing = yaml.load(content);
    if (Array.isArray(existing)) {
        return existing;
    } else if (existing) {
        return [existing];
    }
    return [];
}

/**
 * Saves the configuration to ~/.llaminate/config.yaml
 */
function saveConfig(config: SetupResult): void {
    const yaml = require('js-yaml');
    const dir = ensureLlaminateDir();
    const configPath = path.join(dir, 'config.yaml');
    
    const existingConfigs = loadExistingConfigs();
    
    const existingIndex = existingConfigs.findIndex(c => c.name === config.name);
    if (existingIndex !== -1) {
        existingConfigs[existingIndex] = {
            name: config.name,
            endpoint: config.endpoint,
            model: config.model,
            key: config.name.toUpperCase(),
            ...(config.system !== undefined && { system: config.system.split('\n') })
        };
    } else {
        existingConfigs.push({
            name: config.name,
            endpoint: config.endpoint,
            model: config.model,
            key: config.name.toUpperCase(),
            ...(config.system !== undefined && { system: config.system.split('\n') })
        });
    }
    
    fs.writeFileSync(configPath, yaml.dump(existingConfigs, { sortKeys: false }));
}

/**
 * Saves the API key to ~/.llaminate/.env
 */
function saveApiKey(keyName: string, apiKey: string): void {
    const dir = ensureLlaminateDir();
    const envPath = path.join(dir, '.env');
    
    let existingEnv = '';
    if (fs.existsSync(envPath)) {
        existingEnv = fs.readFileSync(envPath, 'utf-8');
    }
    
    const envMap: Record<string, string> = {};
    const lines = existingEnv.split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed === '' || trimmed.startsWith('#')) continue;
        const equalIndex = trimmed.indexOf('=');
        if (equalIndex !== -1) {
            const name = trimmed.substring(0, equalIndex).trim();
            let value = trimmed.substring(equalIndex + 1).trim();
            // Remove surrounding quotes if present
            if (value.startsWith('"') && value.endsWith('"')) {
                value = value.slice(1, -1);
            } else if (value.startsWith("'") && value.endsWith("'")) {
                value = value.slice(1, -1);
            }
            envMap[name] = value;
        }
    }
    
    envMap[keyName] = apiKey;
    
    const newLines = Object.entries(envMap).map(([name, value]) => `${name}="${value}"`);
    fs.writeFileSync(envPath, newLines.join('\n') + '\n');
}

/**
 * Starts the setup UI using Ink
 */
async function startSetup(preFillName?: string): Promise<SetupResult | null> {
    const React = await importEsm('react');
    const Ink = await importEsm('ink');
    const { render, Box, Text, useInput, useApp } = Ink;
    const h = React.createElement;
    
    // Load existing configs once for name uniqueness check
    const existingConfigs = loadExistingConfigs();
    const existingNames = existingConfigs.map(c => c.name);

    return new Promise((resolve) => {
        const App = () => {
            const { exit } = useApp();
            const [name, setName] = React.useState(preFillName || '');
            const [endpoint, setEndpoint] = React.useState('');
            const [apiKey, setApiKey] = React.useState('');
            const [model, setModel] = React.useState('');
            const [system, setSystem] = React.useState('');
            const [hidden, setHidden] = React.useState(true);
            const [focusedField, setFocusedField] = React.useState<'name' | 'endpoint' | 'model' | 'key' | 'system' | 'save'>('name');

            const fields: ('name' | 'endpoint' | 'model' | 'key' | 'system')[] = ['name', 'endpoint', 'model', 'key', 'system'];
            const allFields: ('name' | 'endpoint' | 'model' | 'key' | 'system' | 'save')[] = ['name', 'endpoint', 'model', 'key', 'system', 'save'];

            // Validation
            const trimmedName = name.trim().toLowerCase();
            const isNameValid = trimmedName !== '' && !existingNames.includes(trimmedName);
            const isNameDuplicate = trimmedName !== '' && existingNames.includes(trimmedName);
            const isEndpointValid = endpoint.trim() !== '' && isValidUrl(endpoint.trim().toLowerCase());
            const isModelValid = model.trim().toLowerCase() !== '';
            const isKeyValid = apiKey.trim() !== '';
            const isSystemFilled = system.trim() !== '';
            const isFormValid = isNameValid && isEndpointValid && isModelValid;

            const handleSubmit = () => {
                if (focusedField === 'save') {
                    const trimmedName = name.trim().toLowerCase();
                    const trimmedEndpoint = endpoint.trim().toLowerCase();
                    const trimmedModel = model.trim().toLowerCase();

                    if (trimmedName === '' || trimmedEndpoint === '' || trimmedModel === '') return;
                    if (!isValidUrl(trimmedEndpoint)) return;

                    resolve({
                        name: trimmedName,
                        endpoint: trimmedEndpoint,
                        apiKey: apiKey.trim(),
                        model: trimmedModel,
                        system: system.trim()
                    });
                    exit();
                    return;
                }

                const trimmedName = name.trim().toLowerCase();
                const trimmedEndpoint = endpoint.trim().toLowerCase();
                const trimmedModel = model.trim().toLowerCase();

                if (focusedField === 'name') {
                    if (trimmedName === '') return;
                    setFocusedField('endpoint');
                } else if (focusedField === 'endpoint') {
                    if (trimmedEndpoint === '') return;
                    if (!isValidUrl(trimmedEndpoint)) return;
                    setFocusedField('model');
                } else if (focusedField === 'model') {
                    if (trimmedModel === '') return;
                    setFocusedField('key');
                } else if (focusedField === 'key') {
                    setFocusedField('system');
                } else if (focusedField === 'system') {
                    setFocusedField('save');
                }
            };

            useInput((input: string, key: any) => {
                if (key.ctrl && input === 'c') {
                    resolve(null);
                    exit();
                    return;
                }

                // For system field, Enter inserts newline instead of submitting
                if (key.return) {
                    if (focusedField === 'system') {
                        setSystem(system + '\n');
                        return;
                    }
                    handleSubmit();
                    return;
                }

                // Tab navigation - skip save button when not valid
                if (key.tab) {
                    const currentIndex = allFields.indexOf(focusedField);
                    let nextIndex: number;

                    if (key.shift) {
                        // Shift+Tab: move back
                        nextIndex = (currentIndex - 1 + allFields.length) % allFields.length;
                        // Skip save if not valid when moving backwards
                        if (allFields[nextIndex] === 'save' && !isFormValid) {
                            nextIndex = (nextIndex - 1 + allFields.length) % allFields.length;
                        }
                    } else {
                        // Tab: move forward
                        nextIndex = (currentIndex + 1) % allFields.length;
                        // Skip save if not valid when moving forward
                        if (allFields[nextIndex] === 'save' && !isFormValid) {
                            nextIndex = (nextIndex + 1) % allFields.length;
                        }
                    }

                    setFocusedField(allFields[nextIndex]);
                    return;
                }

                // Toggle password visibility
                if (focusedField === 'key' && key.ctrl && input === 'h') {
                    setHidden(prev => !prev);
                    return;
                }

                if (key.backspace || key.delete) {
                    if (focusedField !== 'save') {
                        const setters: Record<string, (v: string) => void> = {
                            name: setName,
                            endpoint: setEndpoint,
                            model: setModel,
                            key: setApiKey,
                            system: setSystem
                        };
                        const setter = setters[focusedField];
                        if (setter) {
                            const values: Record<string, string> = { name, endpoint, model, key: apiKey, system };
                            const currentValue = values[focusedField];
                            setter(currentValue.slice(0, -1));
                        }
                    }
                    return;
                }

                if (key.ctrl || key.meta) return;

                if (input && focusedField !== 'save') {
                    const setters: Record<string, (v: string) => void> = {
                        name: setName,
                        endpoint: setEndpoint,
                        model: setModel,
                        key: setApiKey,
                        system: setSystem
                    };
                    const setter = setters[focusedField];
                    if (setter) {
                        const values: Record<string, string> = { name, endpoint, model, key: apiKey, system };
                        const currentValue = values[focusedField];
                        let newValue = currentValue + input;
                        // Convert to lowercase for name, endpoint, model (not for key or system)
                        if (focusedField === 'name' || focusedField === 'endpoint' || focusedField === 'model') {
                            newValue = newValue.toLowerCase();
                        }
                        setter(newValue);
                    }
                }
            });

            const displayValue = (value: string, isHidden: boolean) => isHidden ? '*'.repeat(value.length) : value;

            const getFieldDisplay = (field: string) => {
                const isFocused = focusedField === field;
                const values: Record<string, string> = { name, endpoint, model, key: apiKey, system };
                const fieldValue = values[field];

                if (field === 'key') {
                    const displayed = displayValue(fieldValue, hidden);
                    return isFocused ? displayed + '█' : displayed;
                }

                return isFocused ? fieldValue + '█' : fieldValue;
            };

            // Label color: cyan if valid, gray if not
            const getLabelColor = (field: string) => {
                if (field === 'name') return isNameValid ? 'cyan' : 'gray';
                if (field === 'endpoint') return isEndpointValid ? 'cyan' : 'gray';
                if (field === 'model') return isModelValid ? 'cyan' : 'gray';
                if (field === 'key') return isKeyValid ? 'cyan' : 'gray';
                if (field === 'system') return isSystemFilled ? 'cyan' : 'gray';
                return 'gray';
            };

            // Get the color for the input value
            const getValueColor = (field: string) => {
                if (field === 'name' && isNameDuplicate) return 'red';
                return 'white';
            };

            // Render system field with word-wrapping support
            const renderSystemField = () => {
                const isFocused = focusedField === 'system';
                const labelColor = getLabelColor('system');
                const colorCode = labelColor === 'cyan' ? ANSI.cyan : ANSI.gray;
                const prefix = `  ${isFocused ? ANSI.bold : ''}${colorCode}system${ANSI.reset}: `;
                const lines = system.split('\n');
                return h(Box, { flexDirection: 'column' },
                    h(Box, { key: 'system-first', flexDirection: 'row' },
                        h(Text, { color: 'white' }, prefix + lines[0] + (isFocused && lines.length === 1 ? '█' : ''))
                    ),
                    ...lines.slice(1).map((line, i, arr) =>
                        h(Box, { key: `system-line-${i}`, flexDirection: 'row' },
                            h(Text, { color: 'white' }, '          ' + line + (isFocused && i === arr.length - 1 ? '█' : ''))
                        )
                    )
                );
            };

            return h(Box, { flexDirection: 'column' },
                // Header
                h(Text, null, '👋 Llaminate v' + packageVersion),
                h(Text, null, ' '),
                // YAML-like config fields with proper indentation
                h(Box, { flexDirection: 'row' },
                    h(Text, null, '- '),
                    h(Text, { color: getLabelColor('name'), bold: focusedField === 'name' }, 'name'),
                    h(Text, { color: getLabelColor('name') }, ': '),
                    h(Text, { color: getValueColor('name') }, getFieldDisplay('name'))
                ),
                h(Box, { flexDirection: 'row' },
                    h(Text, null, '  '),
                    h(Text, { color: getLabelColor('endpoint'), bold: focusedField === 'endpoint' }, 'endpoint'),
                    h(Text, { color: getLabelColor('endpoint') }, ': '),
                    h(Text, { color: 'white' }, getFieldDisplay('endpoint'))
                ),
                h(Box, { flexDirection: 'row' },
                    h(Text, null, '  '),
                    h(Text, { color: getLabelColor('model'), bold: focusedField === 'model' }, 'model'),
                    h(Text, { color: getLabelColor('model') }, ': '),
                    h(Text, { color: 'white' }, getFieldDisplay('model'))
                ),
                h(Box, { flexDirection: 'row' },
                    h(Text, null, '  '),
                    h(Text, { color: getLabelColor('key'), bold: focusedField === 'key' }, 'key'),
                    h(Text, { color: getLabelColor('key') }, ': '),
                    h(Text, { color: 'white' }, getFieldDisplay('key'))
                ),
                renderSystemField(),

                // Single space margin
                h(Text, null, ' '),

                // Save button - always visible
                h(Box, { flexDirection: 'row' },
                    h(Text, { color: isFormValid ? 'cyan' : 'gray', bold: focusedField === 'save', underline: focusedField === 'save' },
                        '~/.llaminate/config.yaml'
                    ),
                    isFormValid && h(Text, null, ' 💾')
                )
            );
        };

        render(h(App), {
            exitOnCtrlC: false,
            stdin: process.stdin,
            stdout: process.stdout
        });
    });
}

/**
 * Runs the complete setup flow
 * @param preFillName - Optional name to pre-fill in the setup form
 */
export async function runSetup(preFillName?: string): Promise<string | null> {
    const result = await startSetup(preFillName);
    if (!result) return null;

    saveConfig(result);
    const keyName = result.name.toUpperCase();
    saveApiKey(keyName, result.apiKey);

    return result.name;
}
