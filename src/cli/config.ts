/**
 * @projectname Llaminate CLI
 * @license
 * Copyright 2026 Oliver Moran <oliver.moran@gmail.com>
 * This source code is licensed under the MIT license found in the
 * LICENSE file at https://github.com/oliver-moran/llaminate
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

/**
 * Interface for CLI configuration, which extends LlaminateConfig
 * but uses a key name that references an .env file instead of the actual key
 */
export interface CliConfig {
    name: string;
    description?: string;
    endpoint: string;
    model: string;
    key: string; // This is the name of the key in the .env file
    [key: string]: any;
}

/**
 * Finds the configuration file based on the search strategy:
 * 1. llaminate.yaml in current working directory
 * 2. ~/.llaminate/config.yaml
 * @throws Error if no configuration file is found
 */
export function findConfigFile(): string {
    const cwdPath = path.join(process.cwd(), 'llaminate.yaml');
    if (fs.existsSync(cwdPath)) {
        return cwdPath;
    }

    const homeDir = os.homedir();
    const homePath = path.join(homeDir, '.llaminate', 'config.yaml');
    if (fs.existsSync(homePath)) {
        return homePath;
    }

    throw new Error(`No configuration file found. Searched:\n  - ${cwdPath}\n  - ${homePath}`);
}

/**
 * Loads configurations from a YAML file.
 * Supports both single config object and array of configs.
 */
export function loadConfigurations(configPath: string): CliConfig[] {
    // Dynamic import of js-yaml to avoid requiring it at the top level
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const yaml = require('js-yaml');
    const content = fs.readFileSync(configPath, 'utf-8');
    const configs = yaml.load(content) as CliConfig | CliConfig[];

    // Normalize to array
    return Array.isArray(configs) ? configs : [configs];
}

/**
 * Resolves the actual API key from the .env file.
 * The .env file is expected to be in the same directory as the config file.
 * @param envPath - Path to the .env file
 * @param keyName - Name of the key to resolve from the .env file
 * @returns The resolved key value, or empty string if not found
 */
export function resolveKeyFromEnv(envPath: string, keyName: string): string {
    if (!fs.existsSync(envPath)) {
        return '';
    }

    try {
        const envContent = fs.readFileSync(envPath, 'utf-8');
        const lines = envContent.split('\n');

        for (const line of lines) {
            const trimmed = line.trim();
            // Skip empty lines and comments
            if (trimmed === '' || trimmed.startsWith('#')) {
                continue;
            }

            // Split on first '=' to handle values that might contain '='
            const equalIndex = trimmed.indexOf('=');
            if (equalIndex === -1) {
                continue; // Not a valid key=value line
            }

            const name = trimmed.substring(0, equalIndex).trim();
            const value = trimmed.substring(equalIndex + 1).trim();

            if (name === keyName) {
                // Remove optional quotes from the value
                return value.replace(/^['"]|['"]$/g, '');
            }
        }
    } catch {
        // If we can't read the .env file, return empty string
    }

    return '';
}

/**
 * Finds a configuration by name from the loaded configurations.
 * @param configs - Array of configuration objects
 * @param configName - Name of the configuration to find
 * @throws Error if configuration is not found
 */
export function findConfigByName(configs: CliConfig[], configName: string): CliConfig {
    const config = configs.find(c => c.name === configName);
    if (!config) {
        const availableNames = configs.map(c => c.name).join(', ');
        throw new Error(`Configuration '${configName}' not found. Available configurations: ${availableNames || 'none'}`);
    }
    return config;
}

/**
 * Loads and resolves a configuration by name.
 * This is the main entry point for loading CLI configurations.
 * @param configName - Name of the configuration to load
 * @returns The resolved configuration with actual key value
 */
export function loadConfig(configName: string): CliConfig & { key: string } {
    const configPath = findConfigFile();
    const configs = loadConfigurations(configPath);
    const config = findConfigByName(configs, configName);

    // Find .env file in same directory as config file
    const envPath = path.join(path.dirname(configPath), '.env');
    const actualKey = resolveKeyFromEnv(envPath, config.key);

    return {
        ...config,
        key: actualKey
    };
}

/**
 * Removes a configuration by name from the config file and cleans up unused keys from .env
 * @param configName - Name of the configuration to remove
 */
export function removeConfig(configName: string): void {
    const yaml = require('js-yaml');
    const configPath = findConfigFile();
    const configs = loadConfigurations(configPath);
    
    // Filter out the config to remove
    const updatedConfigs = configs.filter(c => c.name !== configName);
    
    // Write updated configs back to YAML file
    fs.writeFileSync(configPath, yaml.dump(updatedConfigs, { sortKeys: false }));
    
    // Clean up .env file - remove keys not referenced in any config
    cleanupEnvFile(configPath);
}

/**
 * Cleans up the .env file by removing keys that are not referenced in the config.yaml
 * @param configPath - Path to the config file
 */
function cleanupEnvFile(configPath: string): void {
    const envPath = path.join(path.dirname(configPath), '.env');
    
    if (!fs.existsSync(envPath)) {
        return;
    }
    
    // Get all key names referenced in the config file
    const configs = loadConfigurations(configPath);
    const referencedKeys = new Set(configs.map(c => c.key));
    
    // Read existing .env file
    const envContent = fs.readFileSync(envPath, 'utf-8');
    const lines = envContent.split('\n');
    
    // Filter lines - keep only those with keys that are referenced
    const newLines: string[] = [];
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed === '' || trimmed.startsWith('#')) {
            newLines.push(line);
            continue;
        }
        
        const equalIndex = trimmed.indexOf('=');
        if (equalIndex !== -1) {
            const keyName = trimmed.substring(0, equalIndex).trim();
            if (referencedKeys.has(keyName)) {
                newLines.push(line);
            }
            // If key is not referenced, skip it (don't add to newLines)
        } else {
            newLines.push(line);
        }
    }
    
    fs.writeFileSync(envPath, newLines.join('\n'));
}

/**
 * Validates the config.yaml file by ensuring it can be parsed and validating
 * all configurations against the schema.
 * @param configPath - Path to the config file
 * @throws Error if validation fails
 */
export function validateConfigFile(configPath: string): void {
    // First, check if the file can be parsed
    let content: string;
    try {
        content = fs.readFileSync(configPath, 'utf-8');
    } catch (error) {
        throw new Error(`Failed to read config file: ${(error as Error).message}`);
    }

    // Try to parse as YAML
    const yaml = require('js-yaml');
    let configs: CliConfig | CliConfig[];
    try {
        configs = yaml.load(content) as CliConfig | CliConfig[];
    } catch (error) {
        throw new Error(`Failed to parse config file as YAML: ${(error as Error).message}`);
    }

    // Normalize to array
    const configArray = Array.isArray(configs) ? configs : [configs];

    // If no configs, that's valid (empty file)
    if (configArray.length === 0) {
        return;
    }

    // Load the schema
    let schema: any;
    try {
        let schemaPath = path.resolve(path.dirname(configPath), '../config.schema.json');
        // Also try in the same directory
        if (!fs.existsSync(schemaPath)) {
            const dir = path.dirname(configPath);
            const possiblePaths = [
                path.join(dir, 'config.schema.json'),
                path.join(dir, '../config.schema.json'),
                path.join(dir, '../../src/config.schema.json'),
                path.join(process.cwd(), 'src/config.schema.json')
            ];
            for (const p of possiblePaths) {
                if (fs.existsSync(p)) {
                    schemaPath = p;
                    break;
                }
            }
        }
        const schemaContent = fs.readFileSync(schemaPath, 'utf-8');
        schema = JSON.parse(schemaContent);
    } catch (error) {
        // If we can't find/load the schema, we'll skip schema validation
        // but still ensure the file can be parsed
        return;
    }

    // Load Ajv for validation
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Ajv = require('ajv');
    const ajv = new Ajv({ allowUnionTypes: true });
    const validate = ajv.compile(schema);

    // Validate each configuration
    for (const config of configArray) {
        // The CLI config uses 'key' to reference .env, but the schema expects the actual key value
        // For validation purposes, we'll temporarily replace it with a dummy value
        const configForValidation = {
            ...config,
            key: config.key || 'dummy_key_for_validation'
        };

        const valid = validate(configForValidation);
        if (!valid) {
            const errors = validate.errors ? validate.errors.map((e: any) => 
                `  - ${e.instancePath} ${e.message}`
            ).join('\n') : 'Unknown validation error';
            throw new Error(`Validation failed for configuration "${config.name || '(unnamed)'}":\n${errors}`);
        }
    }
}

/**
 * Lists all configuration names from the config file.
 * @param configPath - Path to the config file
 * @returns Array of configuration names
 */
export function listConfigs(configPath: string): string[] {
    const configs = loadConfigurations(configPath);
    return configs.map(c => c.name);
}

/**
 * Edits a configuration by name using the setup UI.
 * @param configName - Name of the configuration to edit
 * @returns The config name if edited successfully, null if cancelled
 */
export async function editConfig(configName: string): Promise<string | null> {
    // Dynamic import of config-ui
    // @ts-ignore - This will be replaced with a minified version in the build process
    const { runSetup } = require('./config-ui.min.js');
    return runSetup(configName, configName);
}
