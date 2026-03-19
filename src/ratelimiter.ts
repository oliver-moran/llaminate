/**
 * @license
 * Copyright 2026 Oliver Moran <oliver.moran@gmail.com>
 * This source code is licensed under the MIT license found in the
 * LICENSE file at https://github.com/oliver-moran/llaminate
 */

interface Task {
    resolve: Function;
    reject: Function;
    fn: Function;
}

interface Bucket {
    queue: Task[];
    interval: NodeJS.Timeout | null;
}

export class RateLimiter {
    private readonly rpm: number;
    private readonly bucket: Bucket;

    /**
     * Creates a new RateLimiter instance with the specified RPM (requests per minute). If no RPM is provided, it defaults to Infinity (no rate limiting).
     * @param rpm The number of requests allowed per minute for each unique endpoint. Must be a number. If not provided, defaults to Infinity (no rate limiting).
     * @throws Will throw an error if the RPM is not a number.
     * @example
     * const limiter = new RateLimiter(60);
     */
    public constructor(rpm?: number) {
        if (rpm && (isNaN(rpm) || rpm < 1)) throw new Error("RPM must be a number greater than or equal to 1");
        this.rpm = rpm || Infinity;
        this.bucket = { queue: [], interval: null };
    }

    /**
     * Adds a function to the appropriate queue, ensuring that it is executed according to the specified RPM.
     * @param fn The function to be executed
     * @returns A promise that resolves with the result of the function
     * @throws Will throw an error if the first argument is not a function.
     * @example
     * const result = await limiter.queue(() => fetch("https://api.example.com/chat/completions", { method: "POST", body: JSON.stringify({ model: "llm-model-name", messages: [...] }) }));
     */
    public async queue(fn:Function): Promise<any> {
        if (typeof fn !== "function") {
            throw new Error("First argument must be a function");
        }

        // Get the bucket for the current endpoint, creating it if it doesn't exist
        const bucket = this.bucket;

        // Return a promise that will be resolved or rejected when the function is executed
        return new Promise(async (resolve, reject) => {
            // Add the function to the bucket's queue along with its resolve and reject functions
            const task = { resolve, reject, fn };
            bucket.queue.push(task);
            
            // If the bucket's interval is not already set, start it to process the queue at the specified RPM
            const next = _next.bind(this);
            if (bucket.interval === null) {
                next();
                bucket.interval = setInterval(next, 60000 / this.rpm);
            }

            // Define the function that will be called at each interval to process the next task in the queue
            async function _next() {
                const task = bucket.queue.shift();
                if (task) _execute(task);
                else this.clear();
            }

            // Define the function that will execute the task's function and resolve or reject the promise accordingly
            async function _execute(task: Task) {
                if (task) {
                    try { task.resolve(await task.fn()); }
                    catch (err) { task.reject(err); }
                }
            }
        });
    }

    /**
     * Clears the bucket for the given endpoint, removing all queued functions and stopping the interval.
     * @example
     * limiter.clear();
    */
    public clear(): void {
        const bucket = this.bucket;
        if (bucket) {
            bucket.queue = [];
            clearInterval(bucket.interval);
            bucket.interval = null;
        }
    }
}