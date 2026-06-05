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
import { loadConfig, findConfigFile, loadConfigurations, removeConfig, validateConfigFile, listConfigs, editConfig, CliConfig } from './config.min.js';
// @ts-ignore This will be replaced with a minified version in the build process
import { runSetup } from './config-ui.min.js';

/**
 * Validates the config file on launch.
 * If config file exists, validates it can be parsed and matches the schema.
 */
function validateConfigOnLaunch(): void {
    try {
        const configPath = findConfigFile();
        validateConfigFile(configPath);
    } catch (error) {
        console.error(`Configuration validation error: ${(error as Error).message}`);
        process.exit(1);
    }
}

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

    // If config file exists, validate it first
    if (configFileExists) {
        validateConfigOnLaunch();
    }

    // Handle --help/-h flag
    if (args[0] === '--help' || args[0] === '-h') {
        printUsage();
        process.exit(0);
    }

    // Handle --list/-l flag
    if (args[0] === '--list' || args[0] === '-l') {
        if (!configFileExists) {
            console.error('Error: No configuration file found. Cannot list configurations.');
            process.exit(1);
        }
        const configPath = findConfigFile();
        const configs = loadConfigurations(configPath);
        
        if (configs.length === 0) {
            // Empty output if no configurations
        } else {
            // ANSI color codes
            const bold = '\x1b[1m';
            const grey = '\x1b[90m';
            const reset = '\x1b[0m';
            
            for (let i = 0; i < configs.length; i++) {
                const config = configs[i];
                // Line 1: bold name + normal description
                const boldName = `${bold}${config.name}${reset}`;
                const description = config.description || '';
                console.log(`${boldName} ${description}`);
                
                // Line 2: grey model <grey endpoint>
                const greyModel = `${grey}${config.model}${reset}`;
                const greyEndpoint = `${grey}<${config.endpoint}>${reset}`;
                console.log(`${greyModel} ${greyEndpoint}`);
                
                // Blank line separator (not after last item)
                if (i < configs.length - 1) {
                    console.log('');
                }
            }
        }
        process.exit(0);
    }

    // Handle -r/--remove flag for removing a configuration
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

    // Handle -e/--edit flag for editing a configuration
    if (args[0] === '-e' || args[0] === '--edit') {
        if (args.length < 2) {
            console.error('Error: Please provide a configuration name to edit.');
            console.error('Usage: llaminate -e <config-name>');
            process.exit(1);
        }
        const configNameToEdit = args[1];
        
        if (!configFileExists) {
            console.error('Error: No configuration file found. Cannot edit configuration.');
            process.exit(1);
        }
        
        const editedConfigName = await editConfig(configNameToEdit);
        if (editedConfigName) {
            console.log(`Configuration '${editedConfigName}' edited successfully.`);
        } else {
            console.log('Edit cancelled.');
        }
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
       llaminate -e <config-name>
       llaminate --edit <config-name>
       llaminate -r <config-name>
       llaminate --remove <config-name>
       llaminate -l
       llaminate --list
       llaminate --help
       llaminate -h

Arguments:
  <config-name>       Name of the configuration to use.
                      If the configuration doesn't exist, setup mode will start
                      with this name pre-filled.

Options:
  -e, --edit <name>   Edit a configuration without launching it on save.
  -r, --remove <name> Remove a configuration and clean up unused API keys.
  -l, --list          Print a list of all configuration names.
  -h, --help          Show this help message.

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

On launch, the configuration file is validated against config.schema.json.
`);
}

// Run the CLI
main().catch((error) => {
    console.error(`Error: ${(error as Error).message}`);
    process.exit(1);
});
