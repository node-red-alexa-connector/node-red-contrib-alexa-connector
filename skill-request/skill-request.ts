import { LinearBackoff } from "simple-backoff";
import { isNullOrUndefined } from "util";
import { NodeRedMessage, NodeRedMessageType, SkillRequest, NodeRedAuthRequest, NodeRedAuthResponse, SkillResponse, NodeRedError } from "../shared/messages";
import * as nacl from "tweetnacl";
import * as naclutil from "tweetnacl-util";
import * as WebSocket from "ws";
import * as crypto from "crypto";
import * as zlib from "zlib";

interface SkillRequestProperties extends NodeRed.Runtime.NodeProperties {
    connect: string;
    host: string;
    port: number;
    useTls: string;
    verifyTls: string;
}

export interface SkillRequestNode extends NodeRed.Runtime.Node {
    deleted: boolean;
    backoff: any;
    client: WebSocket;
    processSkillResponse(skillResponse: SkillResponse): void;
    credentials: {
        instancePublicKey: string;
        instancePrivateKey: string;
        serverPublicKey: string;
    }
}

module.exports = function (RED: NodeRed.Runtime.Red) {
    const options = {
        credentials: {
            instancePublicKey: {
                type: "text"
            },
            instancePrivateKey: {
                type: "text"
            },
            serverPublicKey: {
                type: "text"
            }
        }
    };

    function constructor(props: SkillRequestProperties) {
        RED.nodes.createNode(this, props);

        const node: SkillRequestNode = this;

        const instancePublicKey = node.credentials.instancePublicKey;

        const serverPublicKey = node.credentials.serverPublicKey;

        const serverPublicKeyBytes = naclutil.decodeBase64(serverPublicKey);

        const instancePrivateKey = node.credentials.instancePrivateKey;

        const instancePrivateKeyBytes = naclutil.decodeBase64(instancePrivateKey);

        node.processSkillResponse = processSkillResponse;
        node.backoff = new LinearBackoff({ min: 2000, max: 6000, step: 250, jitter: 0.8 });
        node.status({ fill: "red", text: "disconnected", shape: "dot" });
        node.on("close", onClose);

        var lastServerSequence = 0;
        var lastClientSequence = 0;

        function buildWebSocket() {
            if (node.deleted)
                return;

            const connect =
                props.connect === "true";

            if (!connect)
                return;

            if (!isNullOrUndefined(node.client))
                return;

            const useTls = props.useTls === "true";

            const verifyTls = props.verifyTls === "true";

            const wsUri =
                `${useTls ? "wss" : "ws"}://` +
                `${props.host}:${props.port}` +
                `/node-red/connect`;

            const wsIgnoreTls = (servername: string, cert: WebSocket.CertMeta) => true;

            const wsOptions: WebSocket.ClientOptions = {
                rejectUnauthorized: verifyTls,
            };

            if (!verifyTls)
                wsOptions.checkServerIdentity = wsIgnoreTls;

            node.status({
                fill: "yellow",
                text: "connecting",
                shape: "dot"
            });

            destroyClient();

            node.client = new WebSocket(wsUri, wsOptions);
            node.client.on("open", onWebSocketOpen);
            node.client.on("close", onWebSocketClose);
            node.client.on("error", onWebSocketError);
            node.client.on("message", onWebSocketMessage);
            node.client.on("ping", onWebSocketPing);
        }

        function onClose() {
            destroyClient();
            node.deleted = true;
        }

        function onWebSocketOpen() {
            const backoffWait =
                node.backoff.next();

            if (backoffWait === 4000)
                node.backoff.reset();

            node.status({
                fill: "green",
                text: "connected",
                shape: "dot"
            });

            sendAuthRequest();
        }

        function onWebSocketClose(code: number, reason: string) {
            node.status({
                fill: "red",
                text: "disconnected",
                shape: "dot"
            });

            error(`websocket close. code '${code}' reason '${reason}'`);

            destroyClient();

            if (node.deleted)
                return;

            const backoffWait = node.backoff.next();

            setTimeout(buildWebSocket, backoffWait);
        };

        function onWebSocketError(e: Error) {
            error(`websocket error: ${e.toString()}`);

            node.status({
                fill: "red",
                text: "websocket error",
                shape: "dot"
            });

            destroyClient();

            if (node.deleted)
                return;

            const backoffWait = node.backoff.next();

            setTimeout(buildWebSocket, backoffWait);
        };

        function onWebSocketMessage(data: WebSocket.Data): void {
            const dataGzip = Buffer.from(data);

            const dataJson = zlib
                .gunzipSync(dataGzip)
                .toString();

            const message: NodeRedMessage =
                JSON.parse(dataJson);

            processMessage(message);
        };

        function onWebSocketPing(data: WebSocket.Data): void {
            node.client.pong();
        }

        function processMessage(message: NodeRedMessage): void {
            lastServerSequence = lastServerSequence + 1;

            const messageVerified = verifyMessage(message);

            if (!messageVerified) {
                error("message verification failed");
                return;
            }

            const payloadGziped = Buffer
                .from(message.payload, "base64");

            const payloadJson = zlib
                .gunzipSync(payloadGziped)
                .toString();

            switch (message.type) {
                case NodeRedMessageType.Error:
                    const errorResponse: NodeRedError = JSON.parse(payloadJson);
                    processError(errorResponse);
                    break;

                case NodeRedMessageType.AuthResponse:
                    const authResponse: NodeRedAuthResponse = JSON.parse(payloadJson);
                    processAuthResponse(authResponse);
                    break;

                case NodeRedMessageType.SkillRequest:
                    const skillRequest: SkillRequest = JSON.parse(payloadJson);
                    processSkillRequest(skillRequest);
                    break;
            }
        }

        function processError(nodeRedError: NodeRedError): void {
            error(`from server: ${nodeRedError.message}`);
        }

        function processAuthResponse(authResponse: NodeRedAuthResponse): void {
            if (authResponse.success) {
                node.status({
                    fill: "green",
                    text: "connected, authenticated",
                    shape: "dot"
                });
                return;
            }

            node.status({
                fill: "yellow",
                text: "connected, auth-error",
                shape: "dot"
            });

            error(authResponse.message);

            setTimeout(() => sendAuthRequest(), 30000);
        }

        function processSkillRequest(skillRequest: SkillRequest): void {
            const message = {
                payload: {
                    skillRequest: skillRequest,
                    skillRequestNodeId: node.id,
                    skillResponse: {
                        version: "1.0",
                        response: {}
                    }
                }
            }

            node.send(message);
        }

        function processSkillResponse(skillResponse: SkillResponse): void {
            sendPayload(skillResponse, NodeRedMessageType.SkillResponse);
        }

        function sendAuthRequest() {
            const authRequest: NodeRedAuthRequest = {
                instancePublicKey: instancePublicKey,
                serverPublicKey: serverPublicKey,
                nodeVersion: getNodeVersion(),
                packageVersion: getPackageVersion(),
            };

            node.status({
                fill: "yellow",
                text: "connected, authenticating...",
                shape: "dot"
            });

            sendPayload(authRequest, NodeRedMessageType.AuthRequest);
        }

        function sendPayload(payload: object, type: NodeRedMessageType): void {
            lastClientSequence = lastClientSequence + 1;

            const payloadJson = JSON.stringify(payload);

            const payloadBuffer = Buffer.from(payloadJson);

            const payloadBase64 = zlib
                .gzipSync(payloadBuffer)
                .toString("base64");

            const message: NodeRedMessage = {
                sequence: lastClientSequence,
                timestamp: new Date().toISOString(),
                type: type,
                payload: payloadBase64,
            };

            sendMessage(message);
        }

        function sendMessage(message: NodeRedMessage) {
            try {
                if (isNullOrUndefined(node.client)) {
                    error("websocket not connected");
                    return;
                }

                const messageSigned = signMessage(message);

                const messageJson = JSON.stringify(messageSigned);

                const messageBuffer = Buffer.from(messageJson);

                const messageGzip = zlib.gzipSync(messageBuffer);

                node.client.send(messageGzip, { binary: true });
            } catch (e) {
                error(e);
            }
        }

        function verifyMessage(message: NodeRedMessage): boolean {
            if (message.sequence !== lastServerSequence) {
                error(`message sequence '${message.sequence}' does not match expected server sequence '${lastServerSequence}'`);
                return false;
            }

            const now = new Date();

            const timestamp = new Date(message.timestamp);

            const timestampLowerBound = new Date(timestamp.getTime() + (-10 * 60000));

            const timestampUpperBound = new Date(timestamp.getTime() + (10 * 60000));

            const timestampWithinBounds =
                timestamp >= timestampLowerBound &&
                timestamp <= timestampUpperBound;

            if (!timestampWithinBounds) {
                const errorMessage =
                    `message timestamp '${message.timestamp}' is not within expected bounds ` +
                    `of current client utc '${now.toISOString()}'. ensure your Node-RED instance's clock ` +
                    `drift is within +/- 10 minutes of Coordinated Universal Time.`;

                error(errorMessage);
                return false;
            }

            const isSigned =
                !isNullOrUndefined(message.signature) &&
                message.signature !== "";

            const isVerificationRequired =
                message.type === NodeRedMessageType.SkillRequest;

            if (isVerificationRequired && !isSigned) {
                error(`message type '${NodeRedMessageType[message.type]}' requires signature but is not signed`);
                return false;
            }

            if (!isVerificationRequired && !isSigned)
                return true;

            const payloadHash = crypto
                .createHash("sha256")
                .update(message.payload)
                .digest("base64");

            const signatureDoc =
                `${0}::` +
                `${message.timestamp}::` +
                `${message.sequence}::` +
                `${instancePublicKey}::` +
                `${serverPublicKey}::` +
                `${message.type}::` +
                `${payloadHash}`;

            const signatureDocBytes = naclutil.decodeUTF8(signatureDoc);

            const messageSignatureBytes = naclutil.decodeBase64(message.signature);

            const validSignature = nacl.sign.detached.verify(
                signatureDocBytes,
                messageSignatureBytes,
                serverPublicKeyBytes
            );

            if (!validSignature) {
                error(`signature verification failed`);
                return false;
            }

            return true;
        }

        function signMessage(message: NodeRedMessage): NodeRedMessage {
            const payloadHash = crypto
                .createHash("sha256")
                .update(message.payload)
                .digest("base64");

            const signatureDoc =
                `${0}::` +
                `${message.timestamp}::` +
                `${message.sequence}::` +
                `${instancePublicKey}::` +
                `${serverPublicKey}::` +
                `${message.type}::` +
                `${payloadHash}`;

            const signatureDocBytes = naclutil.decodeUTF8(signatureDoc);

            const signatureBytes = nacl.sign.detached(signatureDocBytes, instancePrivateKeyBytes);

            const signature = naclutil.encodeBase64(signatureBytes);

            message.signature = signature;
            message.signatureVersion = 0;

            return message;
        }

        function destroyClient(): void {
            try {
                lastServerSequence = 0;
                lastClientSequence = 0;

                if (isNullOrUndefined(node.client))
                    return;

                node.client.close(1000, "client destroyed");
                node.client.terminate();
                node.client.removeAllListeners();
                delete node.client;

                node.status({
                    fill: "red",
                    text: "disconnected",
                    shape: "dot"
                });
            } catch (e) {
                error(`error while destroying client: ${e}`);
            }
        }

        function error(message: string): void {
            node.error(message);
        }

        function getNodeVersion(): string {
            try {
                return process.version;
            } catch (e) {
                return "err";
            }
        }

        function getPackageVersion(): string {
            try {
                const { version } = require(`${__dirname}/../package.json`);
                return version;
            } catch (e) {
                return "err";
            }
        }

        buildWebSocket();
    }

    RED.nodes.registerType("skill-request", constructor, options);
};