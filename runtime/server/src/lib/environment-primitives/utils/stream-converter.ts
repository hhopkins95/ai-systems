import { Readable } from 'stream';

/**
 * Convert Node.js Readable stream to Web ReadableStream.
 * Used by LocalPrimitive and DockerPrimitive for Modal SDK compatibility.
 */
export function nodeStreamToWebStream(nodeStream: Readable): ReadableStream<string> {
    return new ReadableStream({
        start(controller) {
            nodeStream.on('data', (chunk) => {
                controller.enqueue(chunk.toString());
            });
            nodeStream.on('end', () => {
                controller.close();
            });
            nodeStream.on('error', (err) => {
                controller.error(err);
            });
        },
        cancel() {
            nodeStream.destroy();
        }
    });
}

/**
 * Read entire ReadableStream to string.
 */
export async function streamToString(stream: ReadableStream<string>): Promise<string> {
    const reader = stream.getReader();
    let result = '';
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        result += value;
    }
    return result;
}
