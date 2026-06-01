/**
 * @license
 * Copyright 2026 Oliver Moran <oliver.moran@gmail.com>
 * This source code is licensed under the MIT license found in the
 * LICENSE file at https://github.com/oliver-moran/llaminate
 */

import * as os from "node:os";

const { version: LLAMINATE_VERSION } = require("./build-info.json");
const NODE_TITLE = process.title || "Node.js";
const NODE_VERSION = process.version;
const OS_TYPE = os.type();
const OS_ARCH = os.arch();

export const USER_AGENT = `Llaminate/${LLAMINATE_VERSION} (https://github.com/oliver-moran/llaminate; ${NODE_TITLE}/${NODE_VERSION}; ${OS_TYPE}/${OS_ARCH})`;
