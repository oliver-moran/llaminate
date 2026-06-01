/**
 * @license
 * Copyright 2026 Oliver Moran <oliver.moran@gmail.com>
 * This source code is licensed under the MIT license found in the
 * LICENSE file at https://github.com/oliver-moran/llaminate
 */

import { Readability, isProbablyReaderable } from '@mozilla/readability';
import { JSDOM, VirtualConsole } from 'jsdom';
import createDOMPurify = require('dompurify');

// @ts-ignore This will be replaced with a minified version in the buildprocess
import { USER_AGENT } from '../user-agent.min.js';

const ACCEPTED_WEB_TYPES = [
    "application/atom+xml",
    "application/json",
    "application/xml",
    "application/xhtml+xml",
    "application/rss+xml",
    "text/csv",
    "text/html",
    "text/plain",
    "text/xml",
];

interface WebContent {
    url: string;
    mimetype: string;
    content?: string | {
        title?: string;
        text?: string;
    };
    "@attachments"?: URLAttachment[];
}

// Get the content of a URL

export const http = {
    function: {
        name: "http",
        description: "Fetch content from a public URL and return either structured page text or raw resource text. Use this tool when you need to read a web page, API endpoint, feed, or plain-text document before answering.",
        parameters: {
            type: "object",
            properties: {
                method: {
                    type: "string",
                    enum: ["get"],
                    description: "HTTP method for the request. Always use get."
                },
                url: {
                    type: "string",
                    description: "Absolute URL to fetch, including protocol (for example https://...)."
                },
                parse: {
                    type: "boolean",
                    description: "Optional hint for HTML responses. Set true to prioritize extracted readable content (title and main text). Set false to prefer raw page text."
                }
            },
            "required": [
                "method", "url"
            ],
            "additionalProperties": false
        },
        "strict": true
    },
    handler: handler
};

async function handler(name:string, args:any): Promise<WebContent> {
    const response = await fetch(args.url, {
        redirect: 'follow',
        headers: { "User-Agent": USER_AGENT }
    });

    // Check for HTTP status
    if (!response.ok) {
        throw new Error(`HTTP status code: ${response.status}`);
    }

    const mimetype = response.headers.get("content-type")?.split(";")[0] || null;

    // Ensure content type is known
    if (!mimetype || !mimetype.includes("/")) {
        throw new Error("No Content-Type header received.");
    }

    const [type, subtype] = mimetype.split("/");

    // Handle specific MIME types
    if (!ACCEPTED_WEB_TYPES.includes(mimetype) && type !== "text") {
        return {
            mimetype: mimetype,
            url: args.url,
            "@attachments": [{
                mime: mimetype,
                url: args.url,
            }]
        };
    }

    // Handle text or HTML content
    const text = await response.text();

    if (mimetype === "text/html") {
        const content:Partial<WebContent["content"]> = await readWebPageContent(args.url, mimetype, text);
        return {
            url: args.url,
            mimetype: mimetype,
            content: content
        };
    } else {
        return {
            url: args.url,
            mimetype: mimetype,
            content: text,
        }
    }
}

async function readWebPageContent(url:string, mimetype:string, html:string):Promise<Partial<WebContent["content"]>> {
    // in the case of a webpage, let's try to get the content
    const vc = new VirtualConsole();
    vc.on("error", () => {}); // Suppress errors for privacy

    // santize the HTML
    const DOMPurify = createDOMPurify(new JSDOM("").window);
    const clean = DOMPurify.sanitize(html);

    const window = new JSDOM(clean, {
        url: url,
        virtualConsole: vc
    }).window;

    if (isProbablyReaderable(window.document)) {
        const reader = new Readability(window.document);
        const article = reader.parse();
        return {
            title: article?.title?.trim(),
            text: article?.textContent?.trim()
        };
    } else {
        return {
            title: window.document?.title?.trim() || undefined,
            text: window.document?.body?.textContent?.trim() || html
        };
    }
}