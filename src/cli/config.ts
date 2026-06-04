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
