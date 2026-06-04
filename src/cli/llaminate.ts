#!/usr/bin/env node

/**
 * @projectname Llaminate CLI
 * @author Oliver Moran <oliver.moran@gmail.com>
 * @license
 * Copyright 2026 Oliver Moran <oliver.moran@gmail.com>
 * This source code is licensed under the MIT license found in the
 * LICENSE file at https://github.com/oliver-moran/llaminate
 */

// @ts-ignore This will be replaced with a minified version in the build process
import { Llaminate } from '../llaminate.min.js';
// @ts-ignore This will be replaced with a minified version in the build process
import { loadConfig, findConfigFile, loadConfigurations, removeConfig } from './config.min.js';
// @ts-ignore This will be replaced with a minified version in the build process
import { runSetup } from './setup.min.js';

/**
 * Main CLI entry point.
 * Parses command line arguments and starts the chat session.
 */
async function main(): Promise<void> {
    const args = process.argv.slice(2);

    // Check if config file exists
    let configFileExists = true;
    try {
        findConfigFile();
    } catch {
        configFileExists = false;
    }

    // Handle -r flag for removing a configuration
    if (args[0] === '-r' || args[0] === '--remove') {
        if (args.length < 2) {
            console.error('Error: Please provide a configuration name to remove.');
            console.error('Usage: llaminate -r <config-name>');
            process.exit(1);
        }
        const configNameToRemove = args[1];
        removeConfig(configNameToRemove);
        process.exit(0);
    }

    let configName: string | null = null;

    // If no config file exists at all, run setup
    if (!configFileExists) {
        const setupConfigName = await runSetup();
        if (setupConfigName) {
            configName = setupConfigName;
        } else {
            // User cancelled setup
            process.exit(0);
        }
    } else if (args.length === 0) {
        printUsage();
        process.exit(1);
    } else {
        // Check if the provided config name exists
        const configPath = findConfigFile();
        const configs = loadConfigurations(configPath);
        const existingConfig = configs.find(c => c.name === args[0]);
        
        if (!existingConfig) {
            // Config doesn't exist, run setup with the name pre-filled
            const setupConfigName = await runSetup(args[0]);
            if (setupConfigName) {
                configName = setupConfigName;
            } else {
                // User cancelled setup
                process.exit(0);
            }
        } else {
            configName = args[0];
        }
    }

    try {
        // Load the configuration by name
        const config = loadConfig(configName);

        // Create Llaminate instance (name is a valid optional property in LlaminateConfig)
        const model = new Llaminate(config);

        // Start chat session
        await Llaminate.chat(model);
    } catch (error) {
        console.error(`Error: ${(error as Error).message}`);
        process.exit(1);
    }
}

/**
 * Prints usage information to stderr.
 */
function printUsage(): void {
    console.error(`
Usage: llaminate <config-name>
       llaminate -r <config-name>

Arguments:
  <config-name>   Name of the configuration to use.
                  If the configuration doesn't exist, setup mode will start
                  with this name pre-filled.
  -r <config-name> Remove a configuration and clean up unused API keys

Configuration Search:
  1. llaminate.yaml in current directory
  2. ~/.llaminate/config.yaml

The configuration file should contain one or more configurations with:
  - name: User-defined name for this configuration
  - endpoint: API endpoint URL
  - model: Model identifier
  - key: Name of the API key in the .env file (not the actual key)
  - ... (any other valid Llaminate configuration options)

The .env file should be in the same directory as the configuration file.

If no configuration file exists, running 'llaminate' will start the setup mode.
`);
}

// Run the CLI
main().catch((error) => {
    console.error(`Error: ${(error as Error).message}`);
    process.exit(1);
});
