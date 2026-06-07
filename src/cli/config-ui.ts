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
    description?: string;
    endpoint: string;
    apiKey: string;
    model: string;
    system?: string | string[];
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
    
    // Normalize system to array
    const systemArray = config.system ? (Array.isArray(config.system) ? config.system : config.system.split('\n').filter(s => s.trim() !== '')) : undefined;
    
    // For single entry, save as string; for multiple, save as array
    const systemValue = systemArray && systemArray.length === 1 ? systemArray[0] : systemArray;
    
    const existingIndex = existingConfigs.findIndex(c => c.name === config.name);
    if (existingIndex !== -1) {
        existingConfigs[existingIndex] = {
            name: config.name,
            ...(config.description !== undefined && { description: config.description }),
            endpoint: config.endpoint,
            model: config.model,
            key: config.name.toUpperCase(),
            ...(systemValue !== undefined && { system: systemValue })
        };
    } else {
        existingConfigs.push({
            name: config.name,
            ...(config.description !== undefined && { description: config.description }),
            endpoint: config.endpoint,
            model: config.model,
            key: config.name.toUpperCase(),
            ...(systemValue !== undefined && { system: systemValue })
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
async function startSetup(preFillName?: string, editingName?: string): Promise<SetupResult | null> {
    const React = await importEsm('react');
    const Ink = await importEsm('ink');
    const { render, Box, Text, useInput, useApp } = Ink;
    const h = React.createElement;
    
    // Load existing configs once for name uniqueness check
    const existingConfigs = loadExistingConfigs();
    // Filter out the editing name from duplicate check
    const existingNames = existingConfigs.map(c => c.name).filter(n => n !== editingName);
    
    // Find the config being edited to pre-fill values
    const editingConfig = editingName ? existingConfigs.find(c => c.name === editingName) : null;
    
    // Normalize system to string (join if it's an array)
    const initialSystem = editingConfig?.system 
        ? (Array.isArray(editingConfig.system) ? editingConfig.system.join('\n') : editingConfig.system)
        : '';

    return new Promise((resolve) => {
        const App = () => {
            const { exit } = useApp();
            const [name, setName] = React.useState(editingConfig ? editingConfig.name : (preFillName || ''));
            const [description, setDescription] = React.useState(editingConfig?.description || '');
            const [endpoint, setEndpoint] = React.useState(editingConfig?.endpoint || '');
            const [apiKey, setApiKey] = React.useState('');
            const [model, setModel] = React.useState(editingConfig?.model || '');
            // System as array
            const [systemArray, setSystemArray] = React.useState<string[]>(initialSystem ? initialSystem.split('\n').filter(l => l.trim() !== '') : []);
            const [newSystemEntry, setNewSystemEntry] = React.useState('');
            // focusedSystemIndex: which system entry is focused, or -1 for new entry input, or -2 for not in system
            const [focusedSystemIndex, setFocusedSystemIndex] = React.useState<number>(-2);
            const [hidden, setHidden] = React.useState(true);
            const [focusedField, setFocusedField] = React.useState<'name' | 'description' | 'endpoint' | 'model' | 'key' | 'save'>('name');

            const fields: ('name' | 'description' | 'endpoint' | 'model' | 'key')[] = ['name', 'description', 'endpoint', 'model', 'key'];
            const allFields: ('name' | 'description' | 'endpoint' | 'model' | 'key' | 'save')[] = ['name', 'description', 'endpoint', 'model', 'key', 'save'];

            // Validation
            const trimmedName = name.trim().toLowerCase();
            const isNameValid = trimmedName !== '' && !existingNames.includes(trimmedName);
            const isNameDuplicate = trimmedName !== '' && existingNames.includes(trimmedName);
            const isDescriptionValid = description.trim() !== '';
            const isEndpointValid = endpoint.trim() !== '' && isValidUrl(endpoint.trim().toLowerCase());
            const isModelValid = model.trim().toLowerCase() !== '';
            const isKeyValid = apiKey.trim() !== '';
            const isSystemFilled = systemArray.length > 0 || newSystemEntry.trim() !== '';
            const isFormValid = isNameValid && isEndpointValid && isModelValid;
            
            // Check if we're currently focused on a system entry (not -2 which means not in system)
            const isInSystem = focusedSystemIndex >= -1 && focusedField === 'save';

            // Get current system value being edited
            const getCurrentSystemValue = () => {
                if (focusedSystemIndex >= 0 && focusedSystemIndex < systemArray.length) {
                    return systemArray[focusedSystemIndex];
                }
                return newSystemEntry;
            };

            // Set current system value
            const setCurrentSystemValue = (value: string) => {
                if (focusedSystemIndex >= 0 && focusedSystemIndex < systemArray.length) {
                    const newArray = [...systemArray];
                    newArray[focusedSystemIndex] = value;
                    setSystemArray(newArray);
                } else {
                    setNewSystemEntry(value);
                }
            };

            const handleSubmit = () => {
                if (focusedField === 'save') {
                    // If we're in system editing mode, save the current entry
                    if (isInSystem) {
                        const currentValue = getCurrentSystemValue();
                        setCurrentSystemValue(currentValue);
                        setFocusedSystemIndex(-2);
                        setFocusedField('save');
                        return;
                    }
                    
                    const trimmedName = name.trim().toLowerCase();
                    const trimmedDescription = description.trim();
                    const trimmedEndpoint = endpoint.trim().toLowerCase();
                    const trimmedModel = model.trim().toLowerCase();

                    if (trimmedName === '' || trimmedEndpoint === '' || trimmedModel === '') return;
                    if (!isValidUrl(trimmedEndpoint)) return;

                    // Build final system array
                    const finalSystemArray = [...systemArray];
                    if (newSystemEntry.trim() !== '') {
                        finalSystemArray.push(newSystemEntry.trim());
                    }

                    resolve({
                        name: trimmedName,
                        ...(trimmedDescription !== '' && { description: trimmedDescription }),
                        endpoint: trimmedEndpoint,
                        apiKey: apiKey.trim(),
                        model: trimmedModel,
                        system: finalSystemArray.length > 0 ? finalSystemArray : undefined
                    });
                    exit();
                    return;
                }

                const trimmedName = name.trim().toLowerCase();
                const trimmedEndpoint = endpoint.trim().toLowerCase();
                const trimmedModel = model.trim().toLowerCase();

                if (focusedField === 'name') {
                    if (trimmedName === '') return;
                    setFocusedField('description');
                } else if (focusedField === 'description') {
                    setFocusedField('endpoint');
                } else if (focusedField === 'endpoint') {
                    if (trimmedEndpoint === '') return;
                    if (!isValidUrl(trimmedEndpoint)) return;
                    setFocusedField('model');
                } else if (focusedField === 'model') {
                    if (trimmedModel === '') return;
                    setFocusedField('key');
                } else if (focusedField === 'key') {
                    // Move to system field
                    setFocusedField('save');
                    // If there are system entries, focus on first one; otherwise focus on new entry
                    setFocusedSystemIndex(systemArray.length > 0 ? 0 : -1);
                    setNewSystemEntry('');
                }
            };

            useInput((input: string, key: any) => {
                if (key.ctrl && input === 'c') {
                    resolve(null);
                    exit();
                    return;
                }

                // Handle system field input
                if (isInSystem) {
                    if (key.return) {
                        // Enter creates new element when on last element or in new entry input
                        if (focusedSystemIndex >= 0 && focusedSystemIndex === systemArray.length - 1) {
                            // Create new element and focus on it
                            const newIndex = systemArray.length;
                            setSystemArray([...systemArray, '']);
                            setFocusedSystemIndex(newIndex);
                            setNewSystemEntry('');
                        } else if (focusedSystemIndex === -1) {
                            // In new entry input, add to array and focus on the new element
                            const newArray = [...systemArray];
                            if (newSystemEntry.trim() !== '') {
                                newArray.push(newSystemEntry.trim());
                            }
                            // Focus on the newly added element (or stay at -1 if nothing was added)
                            const newIndex = newArray.length > systemArray.length ? newArray.length - 1 : -1;
                            setSystemArray(newArray);
                            setFocusedSystemIndex(newIndex);
                            setNewSystemEntry('');
                        }
                        return;
                    }

                    if (key.backspace || key.delete) {
                        const currentValue = getCurrentSystemValue();
                        if (currentValue.length > 0) {
                            setCurrentSystemValue(currentValue.slice(0, -1));
                        } else {
                            // Delete current entry if empty
                            if (focusedSystemIndex >= 0) {
                                if (systemArray.length > 1) {
                                    const newArray = [...systemArray];
                                    newArray.splice(focusedSystemIndex, 1);
                                    setSystemArray(newArray);
                                    if (focusedSystemIndex >= newArray.length) {
                                        setFocusedSystemIndex(newArray.length - 1);
                                    }
                                }
                            } else {
                                setNewSystemEntry('');
                            }
                        }
                        return;
                    }

                    if (key.tab) {
                        // Save current value before moving
                        const currentValue = getCurrentSystemValue();
                        if (currentValue !== undefined && currentValue.trim() !== '') {
                            setCurrentSystemValue(currentValue.trim());
                        }

                        if (key.shift) {
                            // Shift+Tab: move back
                            if (focusedSystemIndex > 0) {
                                setFocusedSystemIndex(focusedSystemIndex - 1);
                            } else if (focusedSystemIndex === 0) {
                                // At first entry, move to key field
                                setFocusedSystemIndex(-2);
                                setFocusedField('key');
                            } else if (focusedSystemIndex === -1) {
                                // At new input, move to last array entry
                                if (systemArray.length > 0) {
                                    setFocusedSystemIndex(systemArray.length - 1);
                                } else {
                                    setFocusedSystemIndex(-2);
                                    setFocusedField('key');
                                }
                            }
                        } else {
                            // Tab: move forward
                            if (focusedSystemIndex >= 0 && focusedSystemIndex < systemArray.length - 1) {
                                // Move to next element
                                setFocusedSystemIndex(focusedSystemIndex + 1);
                            } else if (focusedSystemIndex >= 0 && focusedSystemIndex === systemArray.length - 1) {
                                // At last element, move to save button (Tab no longer creates new entry)
                                setFocusedSystemIndex(-2);
                                setFocusedField('save');
                            } else if (focusedSystemIndex === -1) {
                                // At new input, move to save button
                                setFocusedSystemIndex(-2);
                                setFocusedField('save');
                            }
                        }
                        return;
                    }

                    if (input && focusedSystemIndex >= -1) {
                        setCurrentSystemValue(getCurrentSystemValue() + input);
                        return;
                    }
                    return;
                }

                // Handle non-system field input
                if (key.return) {
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

                    const nextField = allFields[nextIndex];
                    
                    // If moving to 'save' from 'key', enter system editing mode
                    if (focusedField === 'key' && nextField === 'save') {
                        setFocusedField('save');
                        setFocusedSystemIndex(systemArray.length > 0 ? 0 : -1);
                        setNewSystemEntry('');
                        return;
                    }

                    setFocusedField(nextField);
                    return;
                }

                // Toggle password visibility
                if (focusedField === 'key' && key.ctrl && input === 'h') {
                    setHidden(prev => !prev);
                    return;
                }

                if (key.backspace || key.delete) {
                    if (focusedField !== 'save' && !isInSystem) {
                        const setters: Record<string, (v: string) => void> = {
                            name: setName,
                            description: setDescription,
                            endpoint: setEndpoint,
                            model: setModel,
                            key: setApiKey
                        };
                        const setter = setters[focusedField];
                        if (setter) {
                            const values: Record<string, string> = { name, description, endpoint, model, key: apiKey };
                            const currentValue = values[focusedField];
                            setter(currentValue.slice(0, -1));
                        }
                    }
                    return;
                }

                if (key.ctrl || key.meta) return;

                if (input && focusedField !== 'save' && !isInSystem) {
                    const setters: Record<string, (v: string) => void> = {
                        name: setName,
                        description: setDescription,
                        endpoint: setEndpoint,
                        model: setModel,
                        key: setApiKey
                    };
                    const setter = setters[focusedField];
                    if (setter) {
                        const values: Record<string, string> = { name, description, endpoint, model, key: apiKey };
                        const currentValue = values[focusedField];
                        let newValue = currentValue + input;
                        // Convert to lowercase for name, endpoint, model (not for key or description)
                        if (focusedField === 'name' || focusedField === 'endpoint' || focusedField === 'model') {
                            newValue = newValue.toLowerCase();
                        }
                        setter(newValue);
                    }
                }
            });

            const displayValue = (value: string, isHidden: boolean) => isHidden ? '*'.repeat(value.length) : value;

            const getFieldDisplay = (field: string) => {
                const isFocused = focusedField === field && focusedSystemIndex === -2;
                const values: Record<string, string> = { name, description, endpoint, model, key: apiKey };
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
                if (field === 'description') return isDescriptionValid ? 'cyan' : 'gray';
                if (field === 'endpoint') return isEndpointValid ? 'cyan' : 'gray';
                if (field === 'model') return isModelValid ? 'cyan' : 'gray';
                if (field === 'key') return isKeyValid ? 'cyan' : 'gray';
                return 'gray';
            };

            // Get the color for the input value
            const getValueColor = (field: string) => {
                if (field === 'name' && isNameDuplicate) return 'red';
                return 'white';
            };

            // Render system field
            const renderSystemField = () => {
                // Check if system has any non-empty string for label color
                const hasNonEmpty = systemArray.some(e => e.trim() !== '') || newSystemEntry.trim() !== '';
                const systemLabelColor = hasNonEmpty ? 'cyan' : 'gray';
                // Label is bold when focused (focusedField is 'save' and we're in system editing mode)
                const isSystemFocused = focusedField === 'save' && focusedSystemIndex >= -1;
                const systemLabelText = `  ${ANSI[systemLabelColor]}${isSystemFocused ? ANSI.bold : ''}system:${ANSI.reset}`;
                
                // Check if we should show as single string (0 or 1 total entries, and not in multi-element mode)
                const totalNonEmpty = systemArray.filter(e => e.trim() !== '').length + (newSystemEntry.trim() !== '' ? 1 : 0);
                // Show as single only if: totalNonEmpty <= 1 AND systemArray.length <= 1
                // This ensures that once user creates a second element (even if empty), it shows as array
                const showAsSingle = totalNonEmpty <= 1 && systemArray.length <= 1;
                
                if (showAsSingle) {
                    // In single mode, show the value at the current focus position
                    // If focused on an array element, show that element
                    // If focused on new entry (-1), show newSystemEntry
                    // If not focused (focusedField !== 'save'), show the first non-empty or empty
                    let displayValue = '';
                    let valueFocused = false;
                    
                    if (focusedField === 'save' && focusedSystemIndex >= -1) {
                        // We're in system editing mode
                        if (focusedSystemIndex >= 0 && focusedSystemIndex < systemArray.length) {
                            displayValue = systemArray[focusedSystemIndex];
                            valueFocused = true;
                        } else if (focusedSystemIndex === -1) {
                            displayValue = newSystemEntry;
                            valueFocused = true;
                        }
                    } else {
                        // Not focused on system, show first non-empty value or empty
                        for (let i = 0; i < systemArray.length; i++) {
                            if (systemArray[i].trim() !== '') {
                                displayValue = systemArray[i];
                                break;
                            }
                        }
                        if (displayValue === '' && newSystemEntry.trim() !== '') {
                            displayValue = newSystemEntry;
                        }
                        valueFocused = false;
                    }
                    
                    return h(Box, { key: 'system-single', flexDirection: 'row' },
                        h(Text, null, `${systemLabelText} `),
                        h(Text, { color: 'white' }, displayValue + (valueFocused ? '█' : ''))
                    );
                }
                
                // Multiple entries: show as YAML array
                return h(Box, { flexDirection: 'column' },
                    h(Text, { key: 'system-label' }, systemLabelText),
                    ...systemArray.map((entry, i) => {
                        const isFocused = focusedSystemIndex === i;
                        return h(Text, { key: `system-${i}`, color: 'white' }, `    - ${entry}${isFocused ? '█' : ''}`);
                    }),
                    // New entry input - only show if focused
                    focusedSystemIndex === -1 &&
                    h(Text, { key: 'system-new', color: 'white' }, `    - ${newSystemEntry}█`)
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
                    h(Text, { color: getLabelColor('description'), bold: focusedField === 'description' }, 'description'),
                    h(Text, { color: getLabelColor('description') }, ': '),
                    h(Text, { color: 'white' }, getFieldDisplay('description'))
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

                // Save button - only highlight when not in system editing
                h(Box, { flexDirection: 'row' },
                    h(Text, { color: isFormValid ? 'cyan' : 'gray', bold: focusedField === 'save' && focusedSystemIndex === -2, underline: focusedField === 'save' && focusedSystemIndex === -2 },
                        '~/.llaminate/config.yaml'
                    ),
                    isFormValid && h(Text, null, ' 💾')
                )
            );
        };

        render(h(App), {
            exitOnCtrlC: false
        });
    });
}

/**
 * Runs the complete setup flow
 * @param preFillName - Optional name to pre-fill in the setup form
 * @param editingName - Optional name of config being edited (to skip duplicate check)
 */
export async function runSetup(preFillName?: string, editingName?: string): Promise<string | null> {
    const result = await startSetup(preFillName, editingName);
    if (!result) return null;

    saveConfig(result);
    const keyName = result.name.toUpperCase();
    saveApiKey(keyName, result.apiKey);

    return result.name;
}
